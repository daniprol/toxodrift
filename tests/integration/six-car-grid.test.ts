import { expect, it } from 'vitest';
import { startingGrid } from '../../src/race/grid';
import { canOccupy } from '../../src/race/physics';
import { Race } from '../../src/race/race';
import { gameConfig } from '../helpers/fixtures';
import { HAS_ORIGINAL_ASSETS, originalTrack } from '../helpers/original-assets';

it.skipIf(!HAS_ORIGINAL_ASSETS)(
  'supports nonoverlapping extra grid slots and six-car simulation on all 19 circuits',
  () => {
    const config = gameConfig();
    for (let index = 0; index < 10; index++) {
      for (const alternate of index === 0 ? [false] : [false, true]) {
        const track = originalTrack({ index, alternate });
        const grid = startingGrid(track, 6, config.physics.collisionRadius);
        expect(grid, `${index}/${alternate}`).toHaveLength(6);
        for (const point of grid.slice(4)) {
          expect(
            canOccupy({ track, position: point, radius: config.physics.collisionRadius }),
          ).toBe(true);
          expect(
            grid
              .filter((other) => other !== point)
              .every(
                (other) =>
                  Math.hypot(other.x - point.x, other.y - point.y) >=
                  config.physics.collisionRadius * 2,
              ),
          ).toBe(true);
        }
        const game = new Race({
          config,
          track,
          carId: 'vagabond',
          laps: 1,
          opponents: 5,
          weapons: false,
          spectate: true,
        });
        for (let tick = 0; tick < 700; tick++) {
          game.step();
        }
        expect(
          game.state.racers.every((racer) => Number.isFinite(racer.x) && Number.isFinite(racer.y)),
        ).toBe(true);
      }
    }
  },
);
