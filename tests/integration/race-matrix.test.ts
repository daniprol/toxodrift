import { describe, expect, it } from 'vitest';
import { Race } from '../../src/race/race';
import { gameConfig } from '../helpers/fixtures';
import { HAS_ORIGINAL_ASSETS, originalTrack, runUntilFinished } from '../helpers/original-assets';

const MAXIMUM_RACE_SECONDS = 150;
const config = gameConfig();
config.race.countdownSeconds = 0;

describe.skipIf(!HAS_ORIGINAL_ASSETS)(
  'every stock car can navigate every original circuit in traffic',
  () => {
    for (let index = 0; index < 10; index++) {
      const variants = index === 0 ? [false] : [false, true];

      for (const alternate of variants) {
        const track = HAS_ORIGINAL_ASSETS ? originalTrack({ index, alternate }) : null;

        for (const car of config.cars) {
          it(`${car.name} finishes TR${index}${alternate ? ' alternate' : ''} with all three rivals`, () => {
            if (!track) {
              throw new Error('Missing original assets');
            }

            const race = new Race({
              track,
              config,
              carId: car.id,
              laps: 1,
              opponents: 3,
              weapons: false,
              spectate: true,
            });
            runUntilFinished(race, MAXIMUM_RACE_SECONDS);

            expect(race.state.finishOrder).toHaveLength(4);

            for (const racer of race.state.racers) {
              expect(racer.completedLaps).toBe(1);
              expect(racer.health).toBeGreaterThan(0);
            }
          });
        }
      }
    }
  },
);
