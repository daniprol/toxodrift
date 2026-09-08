import { describe, expect, it } from 'vitest';
import { integrateCar, moveCar } from '../../src/race/physics';
import { IDLE_INPUT } from '../../src/race/types';
import { gameConfig, openTrack, testRace } from '../helpers/fixtures';

describe('driving', () => {
  it('matches an independently calculated original acceleration trace', () => {
    const racer = testRace().state.racers[0]!;
    const config = gameConfig();
    // v(n+1) = .96628*v(n) + .067048 for the stock Vagabond.
    const terminal = 0.067048 / (1 - 0.96628);

    for (let tick = 1; tick <= 140; tick++) {
      integrateCar({ racer, input: { ...IDLE_INPUT, accelerate: true }, config, steeringScale: 1 });

      expect(racer.speed).toBeCloseTo(terminal * (1 - 0.96628 ** tick), 10);
    }
  });

  it('coasts, brakes, reverses, and drains turbo only while pressed', () => {
    const config = gameConfig();
    const racer = testRace().state.racers[0]!;

    for (let i = 0; i < 100; i++) {
      integrateCar({
        racer,
        input: { ...IDLE_INPUT, accelerate: true, turbo: true },
        config,
        steeringScale: 1,
      });
    }

    expect(racer.speed).toBeGreaterThan(2.8);
    expect(racer.turbo).toBe(config.physics.turboCapacity - 100 * config.physics.turboDrain);

    const speed = racer.speed;
    integrateCar({ racer, input: IDLE_INPUT, config, steeringScale: 1 });

    expect(racer.speed).toBeLessThan(speed);

    for (let i = 0; i < 140; i++) {
      integrateCar({ racer, input: { ...IDLE_INPUT, brake: true }, config, steeringScale: 1 });
    }

    expect(racer.speed).toBeLessThan(0);
    expect(racer.turbo).toBeGreaterThan(
      config.physics.turboCapacity - 100 * config.physics.turboDrain,
    );
  });

  it('steers left and carries lateral drift after releasing the steering key', () => {
    const config = gameConfig();
    const racer = testRace().state.racers[0]!;

    for (let i = 0; i < 40; i++) {
      integrateCar({
        racer,
        input: { ...IDLE_INPUT, accelerate: true, left: true },
        config,
        steeringScale: 1,
      });
    }

    expect(racer.direction).toBeCloseTo(72);
    expect(racer.slip).toBeGreaterThan(0);
    integrateCar({ racer, input: IDLE_INPUT, config, steeringScale: 1 });

    expect(racer.slip).toBeGreaterThan(0);

    for (let i = 0; i < 40; i++) {
      integrateCar({ racer, input: IDLE_INPUT, config, steeringScale: 1 });
    }

    expect(racer.slip).toBe(0);
  });

  it('cannot tunnel through a wall even under a large movement impulse', () => {
    const track = openTrack();
    const config = gameConfig();
    const racer = testRace().state.racers[0]!;

    for (let y = 0; y < 400; y++) {
      track.terrain[y * 400 + 160] = 0;
    }

    racer.speed = 5;
    moveCar({ racer, movement: { x: 200, y: 0 }, track, config });

    expect(racer.x).toBeLessThan(160);
    expect(racer.speed).toBeLessThan(0);
    expect(racer.health).toBeLessThan(100);
  });

  it('slows the car on rough terrain', () => {
    const config = gameConfig();
    const track = openTrack();
    track.terrain.fill(6);

    const racer = testRace().state.racers[0]!;
    racer.speed = 2;
    moveCar({ racer, movement: { x: 0, y: -2 }, track, config });

    expect(racer.speed).toBeCloseTo((2 * 8) / 9);
  });
});
