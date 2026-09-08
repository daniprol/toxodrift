import type { GameConfig } from '../config/schemas/game';
import type { TrackData } from '../assets/track';
import { canOccupy } from './physics';
import { damageCar } from './combat';
import type { Racer } from './types';

const CONTACT_SPEED_RETAINED = 0.9;

interface ResolveCarCollisionsOptions {
  racers: Racer[];
  track: TrackData;
  config: GameConfig;
}

export function resolveCarCollisions(options: ResolveCarCollisionsOptions): void {
  const { racers, track, config } = options;
  const radius = config.physics.collisionRadius;

  for (let first = 0; first < racers.length; first++) {
    for (let second = first + 1; second < racers.length; second++) {
      const firstCar = racers[first]!;
      const secondCar = racers[second]!;
      const separationX = secondCar.x - firstCar.x;
      const separationY = secondCar.y - firstCar.y;
      const distance = Math.hypot(separationX, separationY);

      if (distance >= radius * 2) {
        continue;
      }

      const normalX = distance === 0 ? 1 : separationX / distance;
      const normalY = distance === 0 ? 0 : separationY / distance;
      const overlap = radius * 2 - distance;
      const firstPosition = {
        x: firstCar.x - (normalX * overlap) / 2,
        y: firstCar.y - (normalY * overlap) / 2,
      };

      const secondPosition = {
        x: secondCar.x + (normalX * overlap) / 2,
        y: secondCar.y + (normalY * overlap) / 2,
      };

      if (canOccupy({ track, position: firstPosition, radius })) {
        Object.assign(firstCar, firstPosition);
      }

      if (canOccupy({ track, position: secondPosition, radius })) {
        Object.assign(secondCar, secondPosition);
      }

      const impact = Math.abs(firstCar.speed - secondCar.speed) * config.physics.collisionDamage;

      if (firstCar.finishedAt === null) {
        damageCar(firstCar, impact);
      }

      if (secondCar.finishedAt === null) {
        damageCar(secondCar, impact);
      }

      firstCar.speed *= CONTACT_SPEED_RETAINED;
      secondCar.speed *= CONTACT_SPEED_RETAINED;
    }
  }
}
