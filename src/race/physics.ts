import { damageFromImpact } from './damage';
import { sampleMap, type TrackData } from '../assets/track';
import type { GameConfig } from '../config/schemas/game';
import { clamp, DEGREES_TO_RADIANS, forward, normalizeDirection } from './math';
import type { DriverInput, Position, Racer } from './types';

const ROAD_MINIMUM = 4;
const MAXIMUM_SLIP = 20;
const STEERING_PIVOT_DIVISOR = 90;
const MOVEMENT_SUBSTEP_PIXELS = 1;
const BODY_VERTICAL_SCALE = 0.83;
const BOOST_SURFACE = 11;
const FRONT_WHEEL_ANGLE = 26;
const FRONT_WHEEL_X_REACH = 18;
const FRONT_WHEEL_Y_REACH = 15;

interface IntegrateCarOptions {
  racer: Racer;
  input: DriverInput;
  config: GameConfig;
  steeringScale: number;
}

/** Original per-tick drivetrain and lateral-slip equations, before collision response. */
export function integrateCar(options: IntegrateCarOptions): Position {
  const { racer, input, config, steeringScale } = options;
  const physics = config.physics;
  racer.speed *= physics.drag;

  if (input.accelerate) {
    const acceleration =
      input.turbo && racer.turbo > 0 ? physics.turboAcceleration : physics.acceleration;
    racer.speed =
      (racer.speed + (acceleration * racer.car.engine) / physics.accelerationDivisor) *
      physics.throttleDrag;
  }

  if (input.brake && !input.mine) {
    racer.speed = (racer.speed - racer.car.engine / physics.brakeDivisor) * physics.throttleDrag;
  }

  racer.turbo = clamp(
    racer.turbo + (input.turbo ? -physics.turboDrain : physics.turboRecharge),
    0,
    physics.turboCapacity,
  );
  racer.slip = (racer.steeringMemory * racer.speed * racer.car.tireSlip) / racer.car.engine;

  if (Math.abs(racer.slip) > MAXIMUM_SLIP) {
    racer.speed *= physics.drag;
  }

  const steer =
    input.steering === undefined
      ? Number(input.left) - Number(input.right)
      : clamp(input.steering, -1, 1);
  const turn = racer.car.steering * steeringScale;
  const pivot =
    ((racer.car.size * steer * turn) / STEERING_PIVOT_DIVISOR) * (1 + (steer * racer.slip) / 18);
  racer.direction = normalizeDirection(racer.direction + steer * turn + racer.collisionTurn);
  if (steer !== 0 && racer.steeringMemory * Math.sign(steer) < physics.steeringMemory) {
    racer.steeringMemory += steer * physics.steeringBuild;
  }
  racer.steeringMemory -=
    Math.sign(racer.steeringMemory) *
    Math.min(Math.abs(racer.steeringMemory), physics.steeringDecay);
  const angle = racer.direction * DEGREES_TO_RADIANS;
  const x = -Math.sin(angle) * racer.speed + (Math.cos(angle) * racer.slip) / physics.slipDivisor;
  const y =
    (-Math.cos(angle) * racer.speed - (Math.sin(angle) * racer.slip) / physics.slipDivisor) *
    physics.verticalScale;
  const magnitude = Math.hypot(x, y);
  const scale = magnitude === 0 ? 1 : Math.abs(racer.speed) / magnitude;

  return {
    x: x * scale - Math.cos(angle) * pivot + racer.collisionVelocity.x,
    y: y * scale + Math.sin(angle) * pivot * physics.verticalScale + racer.collisionVelocity.y,
  };
}

interface CanOccupyOptions {
  track: TrackData;
  position: Position;
  radius: number;
}

export function canOccupy(options: CanOccupyOptions): boolean {
  const { track, position, radius } = options;
  const { width, height } = track.definition;

  if (
    position.x < radius ||
    position.y < radius ||
    position.x >= width - radius ||
    position.y >= height - radius
  ) {
    return false;
  }

  for (const point of [
    { x: 0, y: 0 },
    { x: radius, y: 0 },
    { x: -radius, y: 0 },
    { x: 0, y: radius * BODY_VERTICAL_SCALE },
    { x: 0, y: -radius * BODY_VERTICAL_SCALE },
  ]) {
    if (
      (sampleMap({ track, map: 'terrain', x: position.x + point.x, y: position.y + point.y }) &
        15) <
      ROAD_MINIMUM
    ) {
      return false;
    }
  }

  return true;
}

interface MoveCarOptions {
  racer: Racer;
  movement: Position;
  track: TrackData;
  config: GameConfig;
}

export function moveCar(options: MoveCarOptions): void {
  const { racer, movement, track, config } = options;
  const radius = config.physics.collisionRadius;
  // Substeps prevent crossing thin walls at boosted speeds.
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(movement.x, movement.y) / MOVEMENT_SUBSTEP_PIXELS),
  );
  let collided = false;

  for (let step = 0; step < steps; step++) {
    const next = { x: racer.x + movement.x / steps, y: racer.y + movement.y / steps };

    if (canOccupy({ track, position: next, radius })) {
      racer.x = next.x;
      racer.y = next.y;
    } else {
      collided = true;

      const alongX = { x: next.x, y: racer.y };
      const alongY = { x: racer.x, y: next.y };

      if (canOccupy({ track, position: alongX, radius })) {
        racer.x = alongX.x;
      } else if (canOccupy({ track, position: alongY, radius })) {
        racer.y = alongY.y;
      }

      break;
    }
  }

  if (collided) {
    damageFromImpact(racer, racer.speed * racer.speed * config.physics.collisionDamage);
    racer.collisionVelocity = { x: 0, y: 0 };
    racer.speed *= -config.physics.wallBounce;
  }

  const surface = sampleMap({ track, map: 'terrain', x: racer.x, y: racer.y }) & 15;
  racer.speed *= config.physics.terrainDrag[surface]!;

  if (surface === BOOST_SURFACE && !collided) {
    racer.speed += racer.car.engine / config.physics.accelerationDivisor;
  }
}

export function frontWheels(racer: Racer): Position[] {
  return [-FRONT_WHEEL_ANGLE, FRONT_WHEEL_ANGLE].map((offset) => {
    const direction = forward(racer.direction + offset);

    return {
      x: racer.x + direction.x * FRONT_WHEEL_X_REACH,
      y: racer.y + direction.y * FRONT_WHEEL_Y_REACH,
    };
  });
}
