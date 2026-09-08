import { sampleMap, type TrackData } from '../assets/track';
import type { GameConfig } from '../config/schemas/game';
import { distance, forward } from './math';
import type { DriverInput, Racer, RaceState } from './types';

const BULLET_STEP = 0.5;
const GUN_MUZZLE_DISTANCE = 15;
const MINE_DROP_DISTANCE = 18;
const SHOT_VISIBLE_SECONDS = 0.08;
const ARMOR_DIVISOR = 1024;

export function damageCar(racer: Racer, damage: number): void {
  racer.health = Math.max(0, racer.health - damage * (1 - racer.car.armor / ARMOR_DIVISOR));
}

interface UseWeaponsOptions {
  racer: Racer;
  input: DriverInput;
  state: RaceState;
  track: TrackData;
  config: GameConfig;
}

export function useWeapons(options: UseWeaponsOptions): void {
  const { racer, input, state, track, config } = options;
  const heading = forward(racer.direction);

  if (input.fire && racer.ammo > 0 && racer.gunCooldown <= 0) {
    racer.ammo--;
    racer.gunCooldown = config.combat.gunInterval;

    const origin = {
      x: racer.x + heading.x * GUN_MUZZLE_DISTANCE,
      y: racer.y + heading.y * GUN_MUZZLE_DISTANCE,
    };

    let endpoint = origin;
    // Include the space inside the muzzle offset so nearby walls cannot be skipped.
    for (let range = -GUN_MUZZLE_DISTANCE; range <= config.combat.gunRange; range += BULLET_STEP) {
      endpoint = { x: origin.x + heading.x * range, y: origin.y + heading.y * range };

      if ((sampleMap({ track, map: 'terrain', ...endpoint }) & 15) < 4) {
        break;
      }

      if (range < 0) {
        continue;
      }

      const hit = state.racers.find(
        (other) =>
          other.id !== racer.id &&
          other.health > 0 &&
          other.finishedAt === null &&
          distance(endpoint, other) < config.physics.collisionRadius,
      );

      if (hit) {
        damageCar(hit, racer.car.gunDamage);
        break;
      }
    }

    state.shots.push({
      from: distance(racer, endpoint) < GUN_MUZZLE_DISTANCE ? { x: racer.x, y: racer.y } : origin,
      to: endpoint,
      expiresAt: state.elapsed + SHOT_VISIBLE_SECONDS,
    });
  }

  if (input.mine && racer.mines > 0 && racer.mineCooldown <= 0) {
    racer.mines--;
    racer.mineCooldown = config.combat.mineInterval;
    state.mines.push({
      x: racer.x - heading.x * MINE_DROP_DISTANCE,
      y: racer.y - heading.y * MINE_DROP_DISTANCE,
      owner: racer.id,
      armedAt: state.elapsed + config.combat.mineArmSeconds,
    });
  }
}

interface UpdateCombatOptions {
  state: RaceState;
  config: GameConfig;
}

export function updateCombat(options: UpdateCombatOptions): void {
  const { state } = options;
  state.shots = state.shots.filter((shot) => shot.expiresAt > state.elapsed);
  detonateMines(options);
  collectPickups(options);
}

function detonateMines(options: UpdateCombatOptions): void {
  const { state, config } = options;
  state.mines = state.mines.filter((mine) => {
    if (state.elapsed < mine.armedAt) {
      return true;
    }

    const hits = state.racers.filter(
      (racer) =>
        racer.health > 0 &&
        racer.finishedAt === null &&
        distance(racer, mine) < config.combat.mineRadius,
    );

    if (!hits.length) {
      return true;
    }

    hits.forEach((racer) => damageCar(racer, config.combat.mineDamage));

    return false;
  });
}

function collectPickups(options: UpdateCombatOptions): void {
  const { state, config } = options;

  for (const pickup of state.pickups) {
    if (pickup.availableAt > state.elapsed) {
      continue;
    }

    const racer = state.racers.find(
      (car) =>
        car.health > 0 &&
        car.finishedAt === null &&
        distance(car, pickup) < config.combat.pickupRadius,
    );

    if (!racer) {
      continue;
    }

    if (pickup.kind === 'repair') {
      racer.health = Math.min(config.combat.health, racer.health + config.combat.repairAmount);
    }

    if (pickup.kind === 'ammo') {
      racer.ammo = Math.min(config.combat.ammo, racer.ammo + Math.ceil(config.combat.ammo / 4));
    }

    if (pickup.kind === 'turbo') {
      racer.turbo = config.physics.turboCapacity;
    }

    pickup.availableAt = state.elapsed + config.combat.pickupRespawnSeconds;
  }
}
