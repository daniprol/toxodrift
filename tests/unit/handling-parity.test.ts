import { describe, expect, it } from 'vitest';
import { resolveCarCollisions } from '../../src/race/collisions';
import { useWeapons } from '../../src/race/combat';
import { damageFromImpact } from '../../src/race/damage';
import { integrateCar } from '../../src/race/physics';
import { IDLE_INPUT } from '../../src/race/types';
import { gameConfig, testRace } from '../helpers/fixtures';

describe('reported handling and damage regressions', () => {
  it('uses the original stock Vagabond steering conversion, 3.75 / 1.8 degrees per tick', () => {
    const config = gameConfig();
    const racer = testRace().state.racers[0]!;
    for (let tick = 0; tick < 40; tick++) {
      integrateCar({
        racer,
        input: { ...IDLE_INPUT, accelerate: true, left: true },
        config,
        steeringScale: 1,
      });
    }
    expect(racer.direction).toBeCloseTo((40 * 3.75) / 1.8, 8);
  });

  it('a stock Vagabond bullet uses the original 0.2 health-point coefficient', () => {
    const race = testRace({ opponents: 2 });
    const shooter = race.state.racers[0]!;
    const target = race.state.racers[2]!;
    Object.assign(target, { x: 100, y: 260 });
    useWeapons({
      racer: shooter,
      input: { ...IDLE_INPUT, fire: true },
      state: race.state,
      ...race.options,
    });
    // Stock easy armor: Vagabond 120 + level-zero armor 360 = 480.
    expect(100 - target.health).toBeCloseTo(109 / 1024, 8);
  });
  it('does not brake two cars travelling together just because their sides touch', () => {
    const race = testRace({ opponents: 1 });
    const [first, second] = race.state.racers;
    Object.assign(first!, { x: 150, y: 200, speed: 2 });
    Object.assign(second!, { x: 169, y: 200, speed: 2 });
    resolveCarCollisions({ racers: race.state.racers, ...race.options });
    expect(first!.speed).toBeCloseTo(2);
    expect(second!.speed).toBeCloseTo(2);
  });

  for (const car of gameConfig().cars) {
    it(`${car.name}: a single shot cannot nearly destroy an undamaged stock car`, () => {
      const race = testRace({ opponents: 1 });
      const [shooter, target] = race.state.racers;
      shooter!.car = car;
      Object.assign(target!, { x: 100, y: 260 });
      useWeapons({
        racer: shooter!,
        input: { ...IDLE_INPUT, fire: true },
        state: race.state,
        ...race.options,
      });
      expect(target!.health).toBeGreaterThan(90);
    });
  }
});

it('keeps human steering independent of the AI circuit steering map', () => {
  const race = testRace();
  race.options.track.definition.drive.fill(0.25, 256);
  race.step({ ...IDLE_INPUT, left: true });
  expect(race.state.racers[0]!.direction).toBeCloseTo(3.75 / 1.8, 8);
});

it('sustained steering preserves the original 36-tick slip memory', () => {
  const race = testRace();
  for (let i = 0; i < 100; i++) {
    integrateCar({
      racer: race.state.racers[0]!,
      input: { ...IDLE_INPUT, accelerate: true, left: true },
      config: race.options.config,
      steeringScale: 1,
    });
  }
  expect(race.state.racers[0]!.steeringMemory).toBe(36);
});

it('a rear impact transfers motion without repeatedly applying damage while cars remain in contact', () => {
  const race = testRace({ opponents: 1 });
  const [a, b] = race.state.racers;
  Object.assign(a!, { x: 150, y: 220, speed: 3, velocity: { x: 0, y: -3 } });
  Object.assign(b!, { x: 150, y: 201, speed: 1, velocity: { x: 0, y: -1 } });
  const options = { racers: race.state.racers, ...race.options };
  resolveCarCollisions(options);
  expect(a!.speed).toBe(3);
  expect(b!.speed).toBe(1);
  expect(a!.collisionVelocity.y).toBeCloseTo(1.4);
  expect(b!.collisionVelocity.y).toBeCloseTo(-1.4);
  const health = a!.health;
  expect(100 - health).toBeCloseTo(Math.floor((1024 - 580) * 1.4 ** 2) / 1024, 8);
  a!.y = 220;
  b!.y = 201;
  resolveCarCollisions(options);
  expect(a!.health).toBe(health);
});

it('a one-second burst fires 70 small bullets and uses the original ammunition amount', () => {
  const race = testRace({ opponents: 2 });
  const shooter = race.state.racers[0]!;
  const target = race.state.racers[2]!;
  Object.assign(target, { x: 100, y: 260 });
  for (let tick = 0; tick < 70; tick++) {
    shooter.gunCooldown -= 1 / 70;
    useWeapons({
      racer: shooter,
      input: { ...IDLE_INPUT, fire: true },
      state: race.state,
      ...race.options,
    });
  }
  expect(shooter.ammo).toBeCloseTo(100 - (70 * 260) / 1024, 8);
  expect(100 - target.health).toBeCloseTo((70 * 109) / 1024, 8);
});

it('weapons respect the original 240-tick start protection', () => {
  const config = gameConfig();
  const race = testRace({ config });
  const input = { ...IDLE_INPUT, fire: true, mine: true };
  for (let i = 0; i < 240; i++) {
    race.step(input);
  }
  expect(race.state.racers[0]!.ammo).toBe(100);
  expect(race.state.racers[0]!.mines).toBe(8);
  race.step(input);
  expect(race.state.racers[0]!.ammo).toBeCloseTo(100 - 260 / 1024);
  expect(race.state.racers[0]!.mines).toBe(7);
});

it('sustained rubbing retains impact protection across brief gaps in contact', () => {
  const racer = testRace().state.racers[0]!;
  damageFromImpact(racer, 4);
  const health = racer.health;
  for (let tick = 0; tick < 10; tick++) {
    racer.collisionCooldown--;
    damageFromImpact(racer, 4);
  }
  racer.collisionCooldown -= 3;
  damageFromImpact(racer, 4);
  expect(racer.health).toBe(health);
  racer.collisionCooldown = 0;
  damageFromImpact(racer, 4);
  expect(racer.health).toBeLessThan(health);
});

it('a half joystick turn applies half the original steering rate', () => {
  const race = testRace();
  race.step({ ...IDLE_INPUT, accelerate: true, steering: 0.5 });
  expect(race.state.racers[0]!.direction).toBeCloseTo((0.5 * 3.75) / 1.8, 8);
});

it('a glancing side contact preserves forward motion along the contact', () => {
  const race = testRace({ opponents: 1 });
  const [a, b] = race.state.racers;
  Object.assign(a!, { x: 150, y: 200, speed: 3, velocity: { x: 0.2, y: -3 } });
  Object.assign(b!, { x: 169, y: 200, speed: 1, velocity: { x: 0, y: -1 } });
  resolveCarCollisions({ racers: race.state.racers, ...race.options });
  expect(a!.speed).toBe(3);
  expect(a!.collisionVelocity.y).toBe(0);
  expect(b!.collisionVelocity.y).toBe(0);
  expect(a!.collisionVelocity.x).toBeCloseTo(-0.14);
  expect(a!.collisionTurn).toBe(0);
});
