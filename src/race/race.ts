import { drivingFactors, sampleMap } from '../assets/track';
import { driveOpponent } from './ai';
import { updateCombat, useWeapons } from './combat';
import { resolveCarCollisions } from './collisions';
import { canOccupy, integrateCar, moveCar } from './physics';
import { updateProgress } from './progress';
import {
  IDLE_INPUT,
  type DriverInput,
  type RaceOptions,
  type RacePhase,
  type Racer,
  type RaceState,
} from './types';

const OPPONENT_NAMES = ['You', 'Duke Nukem', 'Jane Honda', 'Nasty Nick'];
const MINIMUM_MOVEMENT_PER_TICK = 0.2;
const PICKUP_KINDS = ['repair', 'ammo', 'turbo'] as const;

/** Owns race time and transitions. No DOM, wall clock, IO, or random global state. */
export class Race {
  readonly state: RaceState;
  readonly options: RaceOptions;
  private phaseBeforePause: RacePhase = 'countdown';

  constructor(options: RaceOptions) {
    this.options = options;

    const { config, track } = options;
    const car = config.cars.find((candidate) => candidate.id === options.carId);

    if (!car) {
      throw new Error(`Unknown car: ${options.carId}`);
    }

    if (!Number.isInteger(options.laps) || options.laps < 1 || options.laps > 99) {
      throw new Error('Laps must be between 1 and 99');
    }

    if (!Number.isInteger(options.opponents) || options.opponents < 0 || options.opponents > 3) {
      throw new Error('Opponents must be between 0 and 3');
    }

    const racers: Racer[] = track.definition.starts
      .slice(0, options.opponents + 1)
      .map((start, id) => ({
        ...start,
        id,
        name: OPPONENT_NAMES[id]!,
        car,
        speed: 0,
        steeringMemory: 0,
        slip: 0,
        health: config.combat.health,
        turbo: config.physics.turboCapacity,
        ammo: options.weapons ? config.combat.ammo : 0,
        mines: options.weapons ? config.combat.mines : 0,
        gunCooldown: 0,
        mineCooldown: 0,
        completedLaps: 0,
        checkpoint: 0,
        lapStartedAt: 0,
        bestLap: null,
        finishedAt: null,
        stuckTicks: 0,
        recoveryTicks: 0,
        lastSafePosition: { x: start.x, y: start.y },
        lastSafeDirection: start.direction,
      }));
    this.state = {
      phase: config.race.countdownSeconds > 0 ? 'countdown' : 'racing',
      tick: 0,
      elapsed: 0,
      countdown: config.race.countdownSeconds,
      racers,
      mines: [],
      shots: [],
      finishOrder: [],
      pickups: options.weapons
        ? track.definition.pickups.map((point, index) => ({
            ...point,
            kind: PICKUP_KINDS[index % PICKUP_KINDS.length]!,
            availableAt: 0,
          }))
        : [],
    };
  }

  togglePause(): void {
    if (this.state.phase === 'finished') {
      return;
    }

    if (this.state.phase === 'paused') {
      this.state.phase = this.phaseBeforePause;
    } else {
      this.phaseBeforePause = this.state.phase;
      this.state.phase = 'paused';
    }
  }

  recoverPlayer(): void {
    if (this.state.phase !== 'racing') {
      return;
    }

    const player = this.state.racers[0]!;

    if (player.health <= 0 || player.finishedAt !== null) {
      return;
    }

    if (
      !canOccupy({
        track: this.options.track,
        position: player.lastSafePosition,
        radius: this.options.config.physics.collisionRadius,
      })
    ) {
      return;
    }

    Object.assign(player, player.lastSafePosition);
    player.direction = player.lastSafeDirection;
    player.speed = 0;
    player.slip = 0;
    player.steeringMemory = 0;
  }

  step(playerInput: DriverInput = IDLE_INPUT): void {
    const state = this.state;

    if (state.phase === 'paused' || state.phase === 'finished') {
      return;
    }

    const { config, track, laps, weapons, spectate } = this.options;
    const secondsPerTick = 1 / config.race.tickRate;

    if (state.phase === 'countdown') {
      state.countdown = Math.max(0, state.countdown - secondsPerTick);

      if (state.countdown < secondsPerTick / 2) {
        state.countdown = 0;
        state.phase = 'racing';
      }

      return;
    }

    state.tick++;
    state.elapsed = state.tick / config.race.tickRate;

    for (const racer of state.racers) {
      this.updateRacer(racer, playerInput);
    }

    resolveCarCollisions({ racers: state.racers, track, config });

    if (weapons) {
      updateCombat({ state, config });
    }

    state.racers.forEach((racer) => updateProgress({ racer, track, state, laps }));

    const player = state.racers[0]!;

    if (
      (!spectate && (player.finishedAt !== null || player.health <= 0)) ||
      state.racers.every((racer) => racer.finishedAt !== null || racer.health <= 0) ||
      state.elapsed >= config.race.maxRaceSeconds
    ) {
      state.phase = 'finished';
    }
  }

  private updateRacer(racer: Racer, playerInput: DriverInput): void {
    const { config, track, weapons, spectate } = this.options;
    const state = this.state;
    const secondsPerTick = 1 / config.race.tickRate;
    if (racer.health <= 0 || racer.finishedAt !== null) {
      racer.speed = 0;
      return;
    }

    const input =
      racer.id === 0 && !spectate
        ? playerInput
        : driveOpponent({ racer, racers: state.racers, track, config });
    const zone = sampleMap({ track, map: 'checkpoints', x: racer.x, y: racer.y });
    const previousPosition = { x: racer.x, y: racer.y };
    const movement = integrateCar({
      racer,
      input,
      config,
      steeringScale: drivingFactors(track, zone).steering,
    });
    moveCar({ racer, movement, track, config });
    racer.stuckTicks =
      Math.hypot(racer.x - previousPosition.x, racer.y - previousPosition.y) <
      MINIMUM_MOVEMENT_PER_TICK
        ? racer.stuckTicks + 1
        : 0;
    racer.gunCooldown = Math.max(0, racer.gunCooldown - secondsPerTick);
    racer.mineCooldown = Math.max(0, racer.mineCooldown - secondsPerTick);

    if (weapons) {
      useWeapons({ racer, input, state, track, config });
    }
  }
}
