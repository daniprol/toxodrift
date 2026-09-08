import { expect, it } from 'vitest';
import { GameConfigSchema } from '../../src/config/schemas/game';
import { parseConfig } from '../../src/config/parse';
import { FixedStepClock } from '../../src/platform/fixed-step';
import { gameConfig } from '../helpers/fixtures';

it('allows comments but reports syntax errors with the configuration name', () => {
  expect(
    parseConfig({
      text: `// comments\n${JSON.stringify(gameConfig())}`,
      schema: GameConfigSchema,
      name: 'race.jsonc',
    }).race.laps,
  ).toBe(4);

  expect(() =>
    parseConfig({ text: '{"race":,}', schema: GameConfigSchema, name: 'race.jsonc' }),
  ).toThrow('race.jsonc:');
});

it('rejects unknown parameters, invalid physics and missing car references', () => {
  const config = gameConfig();

  expect(GameConfigSchema.safeParse({ ...config, typo: true }).success).toBe(false);
  config.physics.acceleration = 0;

  expect(GameConfigSchema.safeParse(config).success).toBe(false);
  config.physics.acceleration = 0.8;
  config.race.defaultCar = 'missing';

  expect(GameConfigSchema.safeParse(config).success).toBe(false);
});

it('runs the same number of ticks at 30, 60 and 144 Hz rendering', () => {
  for (const fps of [30, 60, 144]) {
    let ticks = 0;
    const clock = new FixedStepClock({ tickRate: 70, maxFrameSeconds: 0.1, step: () => ticks++ });

    for (let frame = 0; frame <= fps * 2; frame++) {
      clock.advance((frame * 1000) / fps);
    }

    expect(ticks).toBe(140);
  }
});

it('drops background-tab debt and resets cleanly when pausing', () => {
  let ticks = 0;
  const clock = new FixedStepClock({ tickRate: 70, maxFrameSeconds: 0.1, step: () => ticks++ });
  clock.advance(0);
  clock.advance(10000);

  expect(ticks).toBe(7);
  clock.reset();
  clock.advance(20000);

  expect(ticks).toBe(7);
});
