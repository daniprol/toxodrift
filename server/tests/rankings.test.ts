import { expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RankingConfigSchema } from '../src/config';
import { RankingStore } from '../src/store';
import { testRace } from '../../tests/helpers/fixtures';
import { rankFinishers, scoreRace } from '../src/rankings';

it('settles results once, persists identity, caps daily points and keeps bot rewards out of Elo', () => {
  const directory = mkdtempSync(join(tmpdir(), 'toxodrift-ranking-'));
  const path = join(directory, 'test.sqlite');
  const config = RankingConfigSchema.parse({ dailyPointsCap: 15 });
  let store = new RankingStore(path, config);
  try {
    const first = store.register('First');
    const second = store.register('Second');
    const order = [
      {
        racerId: 0,
        playerId: first.player.id,
        name: 'First',
        finished: true,
        forfeited: false,
        rank: 1,
      },
      {
        racerId: 1,
        playerId: second.player.id,
        name: 'Second',
        finished: true,
        forfeited: false,
        rank: 2,
      },
    ];
    const result = store.settle('race1', order, 30);
    expect(result.map((entry) => entry.eloDelta)).toEqual([16, -16]);
    expect(result[0]!.points).toBe(15);
    expect(store.settle('race1', order, 30)).toEqual(result);
    expect(store.authenticate(first.token)!.races).toBe(1);
    expect(store.authenticate('fake')).toBeUndefined();
    const solo = [order[0]!, { ...order[1]!, playerId: undefined }].map(({ playerId, ...entry }) =>
      playerId ? { ...entry, playerId } : entry,
    );
    expect(store.settle('race2', solo, 30)[0]).toMatchObject({ eloDelta: 0, points: 0 });
    store.close();
    store = new RankingStore(path, config);
    expect(store.authenticate(first.token)).toMatchObject({ elo: 1016, points: 15, races: 2 });
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
it('normalizes multiplayer K, respects ties and denies progression to DNFs and short races', () => {
  const config = RankingConfigSchema.parse({});
  const players = new Map(
    Array.from({ length: 6 }, (_, id) => [
      String(id),
      { id: String(id), name: String(id), elo: 1000, points: 0, races: 0, wins: 0 },
    ]),
  );
  const order = Array.from({ length: 6 }, (_, id) => ({
    racerId: id,
    playerId: String(id),
    name: String(id),
    rank: id + 1,
    finished: true,
    forfeited: false,
  }));
  const scored = scoreRace(order, players, config, 30);
  expect(scored[0]!.eloDelta).toBeCloseTo(16);
  expect(scored.reduce((sum, entry) => sum + entry.eloDelta, 0)).toBeCloseTo(0);
  expect(
    scoreRace(order, players, config, 1).every(
      (entry) => entry.points === 0 && entry.eloDelta === 0,
    ),
  ).toBe(true);
  expect(
    scoreRace(
      order.map((entry) => ({ ...entry, rank: 1, finished: false })),
      players,
      config,
      30,
    ).every((entry) => entry.eloDelta === 0 && entry.points === 0),
  ).toBe(true);
});

it('ranks identical finishes and unfinished progress as ties independent of grid order', () => {
  const game = testRace({ opponents: 5 });
  const [first, second, third, fourth, fifth, sixth] = game.state.racers;
  first!.finishedAt = 10;
  second!.finishedAt = 10;
  third!.completedLaps = 1;
  fourth!.completedLaps = 1;
  fifth!.health = 0;
  sixth!.health = 0;
  game.state.finishOrder = [0, 1];
  expect(rankFinishers({ state: game.state, drivers: [] }).map((racer) => racer.rank)).toEqual([
    1, 1, 3, 3, 5, 5,
  ]);
});
