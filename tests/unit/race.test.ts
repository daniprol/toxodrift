import { describe, expect, it } from 'vitest';
import { updateProgress, standings } from '../../src/race/progress';
import { useWeapons, updateCombat } from '../../src/race/combat';
import { IDLE_INPUT } from '../../src/race/types';
import { canOccupy } from '../../src/race/physics';
import { gameConfig, openTrack, paintCheckpoint, testRace } from '../helpers/fixtures';

describe('race rules', () => {
  it('does not award a lap for skipping checkpoints or crossing the finish backwards', () => {
    const track = openTrack();
    const race = testRace({ track });
    const racer = race.state.racers[0]!;

    for (const zone of [4, 3, 2, 1, 4]) {
      paintCheckpoint(track, zone);
      updateProgress({ racer, track, state: race.state, laps: 2 });
    }

    expect(racer.completedLaps).toBe(0);

    for (const zone of [1, 2, 3, 4]) {
      paintCheckpoint(track, zone);
      race.state.elapsed++;
      updateProgress({ racer, track, state: race.state, laps: 2 });
    }

    expect(racer.completedLaps).toBe(1);
    expect(racer.bestLap).toBe(4);
  });

  it('finishes the winner and lets a lapped opponent finish at the next crossing', () => {
    const track = openTrack();
    const race = testRace({ track, opponents: 1 });
    const [winner, other] = race.state.racers;
    winner!.completedLaps = 1;

    for (const zone of [1, 2, 3, 4]) {
      paintCheckpoint(track, zone);
      race.state.elapsed++;
      updateProgress({ racer: winner!, track, state: race.state, laps: 2 });
    }

    for (const zone of [1, 2, 3, 4]) {
      paintCheckpoint(track, zone);
      race.state.elapsed++;
      updateProgress({ racer: other!, track, state: race.state, laps: 2 });
    }

    expect(race.state.finishOrder).toEqual([0, 1]);
    expect(other!.completedLaps).toBe(1);
    expect(standings(race.state).map((car) => car.id)).toEqual([0, 1]);
  });

  it('freezes the entire race while paused and resumes without losing progress', () => {
    const race = testRace();
    race.step({ ...IDLE_INPUT, accelerate: true });
    race.togglePause();

    const paused = structuredClone(race.state);

    for (let i = 0; i < 100; i++) {
      race.step({ ...IDLE_INPUT, accelerate: true, fire: true });
    }

    expect(race.state).toEqual(paused);
    race.togglePause();
    race.step({ ...IDLE_INPUT, accelerate: true });

    expect(race.state.elapsed).toBeGreaterThan(paused.elapsed);
    expect(race.state.racers[0]!.y).toBeLessThan(paused.racers[0]!.y);
  });

  it('ends when the player is destroyed and cannot resume a finished race', () => {
    const race = testRace();
    race.state.racers[0]!.health = 0;
    race.step();

    expect(race.state.phase).toBe('finished');
    race.togglePause();

    expect(race.state.phase).toBe('finished');
  });
});

describe('combat', () => {
  it('blocks a shot when a wall lies between the car and its gun muzzle', () => {
    const race = testRace({ opponents: 1 });
    const shooter = race.state.racers[0]!;
    const target = race.state.racers[1]!;
    const { track, config } = race.options;

    Object.assign(target, { x: 100, y: 260 });
    track.terrain.fill(0, 288 * track.definition.width, 289 * track.definition.width);

    expect(canOccupy({ track, position: shooter, radius: config.physics.collisionRadius })).toBe(
      true,
    );

    useWeapons({
      racer: shooter,
      input: { ...IDLE_INPUT, fire: true },
      state: race.state,
      track,
      config,
    });

    expect(target.health).toBe(config.combat.health);
    expect(shooter.ammo).toBe(config.combat.ammo - 260 / 1024);
    expect(race.state.shots[0]!.to.y).toBeGreaterThanOrEqual(288);
  });

  it('hits the first car in the line of fire, consumes ammunition, and respects cooldown', () => {
    const race = testRace({ opponents: 2 });
    const [shooter, target, behind] = race.state.racers;
    Object.assign(target!, { x: 100, y: 260 });
    Object.assign(behind!, { x: 100, y: 230 });

    const options = {
      racer: shooter!,
      input: { ...IDLE_INPUT, fire: true },
      state: race.state,
      track: race.options.track,
      config: race.options.config,
    };
    useWeapons(options);
    useWeapons(options);

    expect(shooter!.ammo).toBe(100 - 260 / 1024);
    expect(target!.health).toBeLessThan(100);
    expect(behind!.health).toBe(100);
  });

  it('blocks bullets at walls', () => {
    const race = testRace({ opponents: 1 });
    const target = race.state.racers[1]!;
    Object.assign(target, { x: 100, y: 230 });

    for (let x = 0; x < 400; x++) {
      race.options.track.terrain[260 * 400 + x] = 0;
    }

    useWeapons({
      racer: race.state.racers[0]!,
      input: { ...IDLE_INPUT, fire: true },
      state: race.state,
      track: race.options.track,
      config: race.options.config,
    });

    expect(target.health).toBe(100);
  });

  it('arms mines after a delay and detonates exactly once', () => {
    const race = testRace();
    const racer = race.state.racers[0]!;
    race.state.mines.push({ x: racer.x, y: racer.y, owner: 1, armedAt: 1 });
    updateCombat({ state: race.state, config: race.options.config });

    expect(racer.health).toBe(100);
    race.state.elapsed = 1;
    updateCombat({ state: race.state, config: race.options.config });

    const health = racer.health;

    expect(health).toBeLessThan(100);
    expect(race.state.mines).toHaveLength(0);
    updateCombat({ state: race.state, config: race.options.config });

    expect(racer.health).toBe(health);
  });

  it('collects a repair once, caps health, and respawns after the configured delay', () => {
    const race = testRace();
    const racer = race.state.racers[0]!;
    racer.health = 95;
    race.state.pickups.push({ x: racer.x, y: racer.y, kind: 'repair', availableAt: 0 });
    updateCombat({ state: race.state, config: race.options.config });

    expect(racer.health).toBe(100);
    racer.health = 50;
    updateCombat({ state: race.state, config: race.options.config });

    expect(racer.health).toBe(50);
    race.state.elapsed = gameConfig().combat.pickupRespawnSeconds;
    updateCombat({ state: race.state, config: race.options.config });

    expect(racer.health).toBe(65);
  });
});
