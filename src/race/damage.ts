import type { Racer } from './types';

const HEALTH_UNITS_PER_POINT = 1024;
const MAXIMUM_ARMOR = 900;
const PLAYER_ARMOR_BONUS = 100;

/** Original stock armor includes the level-zero armor package, plus driver bonuses. */
export function raceArmor(baseArmor: number, player: boolean, multiplier = 1): number {
  return Math.min(MAXIMUM_ARMOR, (baseArmor + (player ? PLAYER_ARMOR_BONUS : 0)) * multiplier);
}

/** Original health is fixed-point: 1024 units per displayed percentage point. */
export function damageCar(racer: Racer, damage: number): void {
  const units = Math.ceil(damage * (HEALTH_UNITS_PER_POINT - racer.armor));
  racer.health = Math.max(0, racer.health - units / HEALTH_UNITS_PER_POINT);
}

/** race_main.c caps a fresh impact at 10,000 fixed-point units, after armor. */
export function damageFromImpact(racer: Racer, impulseSquared: number): void {
  if (racer.collisionCooldown === 0 && racer.finishedAt === null) {
    const units = Math.min(
      10000,
      Math.floor(impulseSquared * (HEALTH_UNITS_PER_POINT - racer.armor)),
    );
    racer.health = Math.max(0, racer.health - units / HEALTH_UNITS_PER_POINT);
  }
  racer.collisionCooldown += 2;
}
