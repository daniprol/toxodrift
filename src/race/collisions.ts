import type { GameConfig } from '../config/schemas/game';
import type { TrackData } from '../assets/track';
import { canOccupy } from './physics';
import { damageFromImpact } from './damage';
import { clamp, normalizeDirection } from './math';
import type { Racer } from './types';

const CONTACT_IMPULSE = 0.7;
const LINEAR_DECAY = 1.15;
const ANGULAR_DECAY = 1.2;

interface ResolveCarCollisionsOptions {
  racers: Racer[];
  track: TrackData;
  config: GameConfig;
}

/** Original relative-velocity impulses, with circle separation for the browser collision hulls.
 * Contact changes world motion; it does not multiply the engine's forward speed every tick.
 */
export function resolveCarCollisions({ racers, track, config }: ResolveCarCollisionsOptions): void {
  for (const racer of racers) {
    racer.collisionVelocity.x /= LINEAR_DECAY;
    racer.collisionVelocity.y /= LINEAR_DECAY;
    racer.collisionTurn /= ANGULAR_DECAY;
  }
  const radius = config.physics.collisionRadius;
  for (let first = 0; first < racers.length; first++) {
    for (let second = first + 1; second < racers.length; second++) {
      const a = racers[first]!;
      const b = racers[second]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= radius * 2) {
        continue;
      }
      const nx = distance === 0 ? 1 : dx / distance;
      const ny = distance === 0 ? 0 : dy / distance;
      const overlap = radius * 2 - distance;
      const firstPosition = { x: a.x - (nx * overlap) / 2, y: a.y - (ny * overlap) / 2 };
      const secondPosition = { x: b.x + (nx * overlap) / 2, y: b.y + (ny * overlap) / 2 };
      if (canOccupy({ track, position: firstPosition, radius })) {
        Object.assign(a, firstPosition);
      }
      if (canOccupy({ track, position: secondPosition, radius })) {
        Object.assign(b, secondPosition);
      }

      const relativeX = a.velocity.x - b.velocity.x;
      const relativeY = a.velocity.y - b.velocity.y;
      const closingSpeed = relativeX * nx + relativeY * ny;
      if (closingSpeed <= 0) {
        continue;
      }
      // Circle hulls resolve along their contact normal, preserving tangential motion.
      // The original sprite hulls instead roll back blocked movement axes.
      const impulseX = nx * closingSpeed * CONTACT_IMPULSE;
      const impulseY = ny * closingSpeed * CONTACT_IMPULSE;
      a.collisionVelocity.x -= impulseX;
      a.collisionVelocity.y -= impulseY;
      b.collisionVelocity.x += impulseX;
      b.collisionVelocity.y += impulseY;
      // The original only applies this glancing torque between 45° and 135°.
      // Parallel rubbing must not accumulate spin on every contact.
      const headingDifference = Math.abs(normalizeDirection(a.direction - b.direction + 180) - 180);
      if (headingDifference > 45 && headingDifference < 135) {
        a.collisionTurn += clamp(((ny * b.velocity.x - nx * b.velocity.y) * radius) / 4, -3, 3);
        b.collisionTurn += clamp(((nx * a.velocity.y - ny * a.velocity.x) * radius) / 4, -3, 3);
      }
      for (const racer of [a, b]) {
        damageFromImpact(racer, racer.collisionVelocity.x ** 2 + racer.collisionVelocity.y ** 2);
      }
    }
  }
}
