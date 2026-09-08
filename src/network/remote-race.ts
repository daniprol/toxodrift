import type { Room } from '@colyseus/sdk';
import type { OnlineState } from './state';
import type { DriverInput, RaceState } from '../race/types';
import { IDLE_INPUT } from '../race/types';
import type { Race } from '../race/race';

export type OnlineRoom = Room<unknown, OnlineState>;

interface RemoteRaceOptions {
  room: OnlineRoom;
  template: Race;
  racerId: number;
  inputRate: number;
  interpolationMs: number;
}

/** Buffered rendering only: the client cannot modify the authoritative race. */
export class RemoteRace {
  private readonly snapshots: { state: RaceState; time: number }[] = [];
  private latest: { state: RaceState; time: number } | undefined;
  private sequence = 0;
  private sentAt = -Infinity;
  private connected = true;
  private readonly receive = () => {
    const wire = this.options.room.state;
    if (!wire.cars.length) {
      return;
    }
    const state: RaceState = {
      ...this.options.template.state,
      phase: wire.phase as RaceState['phase'],
      tick: wire.tick,
      elapsed: wire.elapsed,
      countdown: wire.countdown,
      racers: wire.cars
        .map((car) => ({
          ...this.options.template.state.racers[car.id]!,
          ...car.toJSON(),
          car: this.options.template.options.config.cars.find((entry) => entry.id === car.carId)!,
          bestLap: car.bestLap < 0 ? null : car.bestLap,
          finishedAt: car.finishedAt < 0 ? null : car.finishedAt,
        }))
        .sort(
          (a, b) => Number(b.id === this.options.racerId) - Number(a.id === this.options.racerId),
        ),
      mines: [],
      shots: [],
      pickups: [],
      finishOrder: [],
    };
    for (const item of wire.items) {
      if (item.kind === 'mine') {
        state.mines.push({ x: item.x, y: item.y, armedAt: item.time, owner: item.owner });
      } else if (item.kind === 'shot') {
        state.shots.push({
          from: { x: item.x, y: item.y },
          to: { x: item.toX, y: item.toY },
          expiresAt: item.time,
        });
      } else if (item.kind === 'repair' || item.kind === 'ammo' || item.kind === 'turbo') {
        state.pickups.push({ x: item.x, y: item.y, kind: item.kind, availableAt: item.time });
      }
    }
    this.latest = { state, time: performance.now() };
    this.snapshots.push(this.latest);
    if (this.snapshots.length > 20) {
      this.snapshots.shift();
    }
  };
  private readonly dropped = () => {
    this.connected = false;
  };
  private readonly reconnected = () => {
    this.connected = true;
    this.clear();
  };
  constructor(private readonly options: RemoteRaceOptions) {
    const { room } = options;
    room.onStateChange(this.receive);
    room.onDrop(this.dropped);
    room.onLeave(this.dropped);
    room.onReconnect(this.reconnected);
    this.receive();
  }
  send(input: DriverInput, now: number): void {
    if (
      !this.connected ||
      !this.options.room.connection.isOpen ||
      now - this.sentAt < 1000 / this.options.inputRate
    ) {
      return;
    }
    this.sentAt = now;
    this.options.room.send('input', { ...input, sequence: ++this.sequence });
  }
  clear(): void {
    if (this.connected && this.options.room.connection.isOpen) {
      this.options.room.send('input', { ...IDLE_INPUT, sequence: ++this.sequence });
    }
  }
  recover(): void {
    if (this.connected && this.options.room.connection.isOpen) {
      this.options.room.send('recover');
    }
  }
  state(now: number): RaceState {
    if (!this.latest) {
      return this.options.template.state;
    }
    if (this.latest.state.phase === 'finished') {
      return this.latest.state;
    }
    const renderAt = now - this.options.interpolationMs;
    const nextIndex = this.snapshots.findIndex((snapshot) => snapshot.time >= renderAt);
    if (nextIndex < 0) {
      return this.latest.state;
    }
    const current = this.snapshots[nextIndex]!;
    const previous = this.snapshots[nextIndex - 1];
    if (!previous) {
      return current.state;
    }
    const alpha = Math.max(
      0,
      Math.min(
        1,
        (now - this.options.interpolationMs - previous.time) /
          Math.max(1, current.time - previous.time),
      ),
    );
    return {
      ...current.state,
      racers: current.state.racers.map((car) => {
        const before = previous.state.racers.find((entry) => entry.id === car.id)!;
        // Recovery teleports snap; degrees wrap through the shortest arc.
        if (Math.hypot(car.x - before.x, car.y - before.y) > 100) {
          return car;
        }
        const turn = ((car.direction - before.direction + 540) % 360) - 180;
        return {
          ...car,
          x: before.x + (car.x - before.x) * alpha,
          y: before.y + (car.y - before.y) * alpha,
          direction: (before.direction + turn * alpha + 360) % 360,
        };
      }),
    };
  }
  dispose(): void {
    this.clear();
    this.options.room.onStateChange.remove(this.receive);
    this.options.room.onDrop.remove(this.dropped);
    this.options.room.onLeave.remove(this.dropped);
    this.options.room.onReconnect.remove(this.reconnected);
  }
}
