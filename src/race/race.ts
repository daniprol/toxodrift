import { startingGrid } from './grid';
import { raceArmor } from './damage';
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

// Duke Nukem (driver 1) receives the original 2.2× armor bonus, capped at 900.
const OPPONENT_NAMES = ['You', 'Duke Nukem', 'Jane Honda', 'Nasty Nick', 'Motor Mary', 'Mad Mac'];
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

    if (!Number.isInteger(options.opponents) || options.opponents < 0 || options.opponents > 5) {
      throw new Error('Opponents must be between 0 and 5');
    }

    const racers: Racer[] = startingGrid(
      track,
      options.opponents + 1,
      config.physics.collisionRadius,
    ).map((start, id) => {
      const driver = options.drivers?.find((entry) => entry.id === id);
      const racerCar = driver ? config.cars.find((entry) => entry.id === driver.carId) : car;
      if (!racerCar) {
        throw new Error(`Unknown car: ${driver?.carId}`);
      }
      return {
        ...start,
        id,
        name: driver?.name ?? OPPONENT_NAMES[id]!,
        car: racerCar,
        speed: 0,
        steeringMemory: 0,
        slip: 0,
        health: config.combat.health,
        armor: options.drivers
          ? raceArmor(racerCar.armor, true)
          : raceArmor(racerCar.armor, id === 0, id === 1 ? 2.2 : 1),
        velocity: { x: 0, y: 0 },
        collisionVelocity: { x: 0, y: 0 },
        collisionTurn: 0,
        collisionCooldown: 0,
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
      };
    });
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

  /** Server deadlines end the world through the same transition as natural completion. */
  finish(): void {
    this.state.phase = 'finished';
  }

  /** A departed human stays in the standings but can no longer move or finish. */
  forfeitDriver(id: number): boolean {
    const racer = this.state.racers.find((entry) => entry.id === id);
    if (!racer || racer.finishedAt !== null || this.state.phase === 'finished') {
      return false;
    }
    racer.health = 0;
    racer.speed = 0;
    racer.velocity = { x: 0, y: 0 };
    return true;
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

  recoverPlayer(id = 0): void {
    if (this.state.phase !== 'racing') {
      return;
    }

    const player = this.state.racers.find((racer) => racer.id === id);

    if (!player) {
      return;
    }

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
    player.velocity = { x: 0, y: 0 };
    player.collisionVelocity = { x: 0, y: 0 };
    player.collisionTurn = 0;
    player.collisionCooldown = 0;
    player.stuckTicks = 0;
  }

  step(playerInput: DriverInput = IDLE_INPUT, inputs?: ReadonlyMap<number, DriverInput>): void {
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
      this.updateRacer(racer, playerInput, inputs);
    }

    resolveCarCollisions({ racers: state.racers, track, config });

    if (weapons) {
      updateCombat({ state, config });
    }

    state.racers.forEach((racer) => updateProgress({ racer, track, state, laps }));

    const player = state.racers[0]!;

    if (
      (!this.options.drivers && !spectate && (player.finishedAt !== null || player.health <= 0)) ||
      state.racers.every((racer) => racer.finishedAt !== null || racer.health <= 0) ||
      state.elapsed >= config.race.maxRaceSeconds
    ) {
      this.finish();
    }
  }

  private updateRacer(
    racer: Racer,
    playerInput: DriverInput,
    inputs?: ReadonlyMap<number, DriverInput>,
  ): void {
    const { config, track, weapons, spectate } = this.options;
    const state = this.state;
    const secondsPerTick = 1 / config.race.tickRate;
    if (racer.health <= 0 || racer.finishedAt !== null) {
      racer.speed = 0;
      racer.velocity = { x: 0, y: 0 };
      return;
    }

    const human = this.options.drivers
      ? this.options.drivers.some((driver) => driver.id === racer.id)
      : racer.id === 0 && !spectate;
    const input = human
      ? this.options.drivers
        ? (inputs?.get(racer.id) ?? IDLE_INPUT)
        : playerInput
      : driveOpponent({ racer, racers: state.racers, track, config });
    const zone = sampleMap({ track, map: 'checkpoints', x: racer.x, y: racer.y });
    const previousPosition = { x: racer.x, y: racer.y };
    const movement = integrateCar({
      racer,
      input,
      config,
      steeringScale: human ? 1 : drivingFactors(track, zone).steering,
    });
    racer.collisionCooldown = Math.max(0, racer.collisionCooldown - 1);
    moveCar({ racer, movement, track, config });
    racer.velocity = { x: racer.x - previousPosition.x, y: racer.y - previousPosition.y };
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
