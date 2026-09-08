import { expect, it } from 'vitest';
import { Race } from '../../src/race/race';
import { IDLE_INPUT } from '../../src/race/types';
import { gameConfig, openTrack } from '../helpers/fixtures';
import { InputSchema, RaceSettingsSchema } from '../../src/network/protocol';

function race() {
  const config = gameConfig();
  config.race.countdownSeconds = 0;
  return new Race({
    config,
    track: openTrack(),
    carId: 'vagabond',
    laps: 1,
    opponents: 5,
    weapons: false,
    drivers: [
      { id: 0, name: 'First', carId: 'vagabond' },
      { id: 1, name: 'Second', carId: 'vagabond' },
    ],
  });
}
it('routes each human input independently and gives humans the same handling and armor', () => {
  const game = race();
  const first = game.state.racers[0]!;
  const second = game.state.racers[1]!;
  game.step(IDLE_INPUT, new Map([[1, { ...IDLE_INPUT, accelerate: true }]]));
  expect(first.speed).toBe(0);
  expect(second.speed).toBeGreaterThan(0);
  expect(first.armor).toBe(second.armor);
  expect(game.state.racers).toHaveLength(6);
});
it('does not stop an online race when the first human finishes or dies', () => {
  const game = race();
  game.state.racers[0]!.health = 0;
  game.step();
  expect(game.state.phase).toBe('racing');
  game.state.racers.forEach((racer) => {
    racer.health = 0;
  });
  game.step();
  expect(game.state.phase).toBe('finished');
});
it('recovers only the named racer', () => {
  const game = race();
  const second = game.state.racers[1]!;
  second.x += 40;
  game.recoverPlayer(1);
  expect(second.x).toBe(second.lastSafePosition.x);
  expect(game.state.racers[0]!.x).toBe(100);
});
it('rejects nonfinite, oversized and authoritative fields in client messages', () => {
  expect(InputSchema.safeParse({ ...IDLE_INPUT, sequence: 1, x: 100 }).success).toBe(false);
  expect(InputSchema.safeParse({ ...IDLE_INPUT, sequence: 1, steering: NaN }).success).toBe(false);
  expect(InputSchema.safeParse({ ...IDLE_INPUT, sequence: 1, steering: 2 }).success).toBe(false);
  const settings = {
    trackId: 'tr1',
    carId: 'vagabond',
    participants: 6,
    ai: 5,
    laps: 4,
    weapons: true,
  };
  expect(RaceSettingsSchema.safeParse(settings).success).toBe(true);
  expect(RaceSettingsSchema.safeParse({ ...settings, ai: 6 }).success).toBe(false);
  expect(RaceSettingsSchema.safeParse({ ...settings, participants: 3 }).success).toBe(false);
});

it('uses each driver car for armor and forfeits only unfinished drivers', () => {
  const config = gameConfig();
  config.cars[1]!.armor = 73;
  const game = new Race({
    config,
    track: openTrack(),
    carId: config.cars[0]!.id,
    laps: 1,
    opponents: 1,
    weapons: false,
    drivers: [{ id: 0, name: 'Other car', carId: config.cars[1]!.id }],
  });
  const driver = game.state.racers[0]!;
  expect(driver.car.id).toBe(config.cars[1]!.id);
  // Player armor includes the existing 100-point race bonus.
  expect(driver.armor).toBe(173);
  driver.finishedAt = 10;
  expect(game.forfeitDriver(0)).toBe(false);
  expect(driver.health).toBeGreaterThan(0);
  expect(game.forfeitDriver(1)).toBe(true);
  expect(game.state.racers[1]!.health).toBe(0);
});
