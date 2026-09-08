import { drivingFactors, sampleMap, type TrackData } from '../assets/track';
import type { GameConfig } from '../config/schemas/game';
import { DEGREES_TO_RADIANS, forward } from './math';
import { IDLE_INPUT, type DriverInput, type Racer } from './types';

const RACING_LINE_INVERSION = 16;
const MINE_TARGET_MINIMUM_DISTANCE = 20;
const MINE_TARGET_MAXIMUM_DISTANCE = 60;
const MINE_TARGET_HALF_WIDTH = 20;

interface DriveOpponentOptions {
  racer: Racer;
  racers: readonly Racer[];
  track: TrackData;
  config: GameConfig;
}

/** Two original LR1 probes steer toward the track's authored racing line. */
export function driveOpponent(options: DriveOpponentOptions): DriverInput {
  const { racer, racers, track, config } = options;
  const input = { ...IDLE_INPUT };
  const zone = sampleMap({ track, map: 'checkpoints', x: racer.x, y: racer.y });
  const factors = drivingFactors(track, zone);
  const sampleSensor = (offset: number) => {
    const vector = forward(racer.direction + offset);

    return (
      RACING_LINE_INVERSION -
      sampleMap({
        track,
        map: 'racingLine',
        x: racer.x + vector.x * config.ai.lookAhead,
        y: racer.y + vector.y * config.ai.lookAhead,
      })
    );
  };
  input.right = sampleSensor(config.ai.sensorAngle) > config.ai.rightThreshold;
  input.left = sampleSensor(-config.ai.sensorAngle) < config.ai.leftThreshold;
  input.accelerate = racer.speed < racer.car.engine * factors.speed;
  // Limit turning radius to the probe distance; stock high-end cars otherwise run wide.
  if (input.left || input.right) {
    const cornerSpeed =
      racer.car.steering *
      factors.steering *
      config.ai.lookAhead *
      DEGREES_TO_RADIANS *
      config.ai.cornerSpeedFactor;
    input.accelerate = racer.speed < cornerSpeed;
    input.brake = racer.speed > cornerSpeed * config.ai.brakingMargin;
  }

  if (racer.recoveryTicks > 0) {
    input.accelerate = false;
    input.brake = true;
    input.left = true;
    input.right = false;
    racer.recoveryTicks--;
  } else if (racer.stuckTicks > config.ai.stuckSeconds * config.race.tickRate) {
    racer.recoveryTicks = Math.round(config.ai.recoverySeconds * config.race.tickRate);
    racer.stuckTicks = 0;
  }

  const heading = forward(racer.direction);

  for (const other of racers) {
    if (other.id === racer.id || other.health <= 0) {
      continue;
    }

    const dx = other.x - racer.x;
    const dy = other.y - racer.y;
    const ahead = dx * heading.x + dy * heading.y;
    const sideways = Math.abs(dx * heading.y - dy * heading.x);

    if (ahead > 0 && ahead < config.combat.gunRange && sideways < config.physics.collisionRadius) {
      input.fire = true;
    }

    if (
      ahead < -MINE_TARGET_MINIMUM_DISTANCE &&
      ahead > -MINE_TARGET_MAXIMUM_DISTANCE &&
      sideways < MINE_TARGET_HALF_WIDTH
    ) {
      input.mine = true;
    }
  }

  return input;
}
