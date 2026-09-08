import { describe, expect, it } from 'vitest';
import { HAS_ORIGINAL_ASSETS, originalTrack, runUntilFinished } from '../helpers/original-assets';
import { Race } from '../../src/race/race';
import { gameConfig } from '../helpers/fixtures';

describe.skipIf(!HAS_ORIGINAL_ASSETS)(
  'original circuits: real AI, physics, masks and lap rules',
  () => {
    for (let index = 0; index < 10; index++) {
      it(`completes two laps on TR${index} without shortcutting checkpoints`, () => {
        const track = originalTrack({ index });

        const config = gameConfig();
        config.race.countdownSeconds = 0;

        const race = new Race({
          track,
          config,
          carId: 'vagabond',
          laps: 2,
          opponents: 0,
          weapons: false,
          spectate: true,
        });

        const visited = new Set<number>();

        for (
          let tick = 0;
          tick < config.race.tickRate * 180 && race.state.phase !== 'finished';
          tick++
        ) {
          race.step();
          visited.add(race.state.racers[0]!.checkpoint);
        }

        expect(race.state.racers[0]!.completedLaps).toBe(2);
        expect(visited.size).toBe(track.definition.zones);
        expect(race.state.racers[0]!.health).toBeGreaterThan(0);
      });
    }

    it('completes a four-car race on the alternate circuit deterministically', () => {
      const track = originalTrack({ index: 1, alternate: true });
      const config = gameConfig();
      config.race.countdownSeconds = 0;

      const run = () => {
        const race = new Race({
          track,
          config,
          carId: 'vagabond',
          laps: 2,
          opponents: 3,
          weapons: false,
          spectate: true,
        });

        runUntilFinished(race, 180);

        return race.state;
      };

      const first = run();

      expect(first.finishOrder).toHaveLength(4);
      expect(first).toEqual(run());
    });
  },
);
