import { sampleMap, type TrackData } from '../assets/track';
import { frontWheels } from './physics';
import type { Racer, RaceState } from './types';

interface UpdateProgressOptions {
  racer: Racer;
  track: TrackData;
  state: RaceState;
  laps: number;
}

export function updateProgress(options: UpdateProgressOptions): void {
  const { racer, track, state, laps } = options;

  if (racer.finishedAt !== null || racer.health <= 0) {
    return;
  }

  const next = racer.checkpoint + 1;
  const wheels = frontWheels(racer);

  if (wheels.some((point) => sampleMap({ track, map: 'checkpoints', ...point }) === next)) {
    racer.checkpoint = next;
    racer.lastSafePosition = { x: racer.x, y: racer.y };
    racer.lastSafeDirection = racer.direction;
  }

  const center = sampleMap({ track, map: 'checkpoints', x: racer.x, y: racer.y });

  if (center === track.definition.zones && racer.checkpoint < track.definition.zones) {
    racer.checkpoint = 0;
  }

  if (racer.checkpoint !== track.definition.zones) {
    return;
  }

  racer.completedLaps++;

  const lapTime = state.elapsed - racer.lapStartedAt;
  racer.bestLap = racer.bestLap === null ? lapTime : Math.min(racer.bestLap, lapTime);
  racer.lapStartedAt = state.elapsed;
  racer.checkpoint = 0;
  // After the winner, each remaining car finishes at its next finish-line crossing.
  if (racer.completedLaps >= laps || state.finishOrder.length > 0) {
    racer.finishedAt = state.elapsed;
    state.finishOrder.push(racer.id);
  }
}

export function standings(state: RaceState): Racer[] {
  return [...state.racers].sort((a, b) => {
    if (a.finishedAt !== null || b.finishedAt !== null) {
      return (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity) || a.id - b.id;
    }

    if (a.health > 0 !== b.health > 0) {
      return a.health > 0 ? -1 : 1;
    }

    return b.completedLaps - a.completedLaps || b.checkpoint - a.checkpoint || a.id - b.id;
  });
}
