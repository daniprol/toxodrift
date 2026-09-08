import { standings } from '../../src/race/progress';
import type { Racer, RaceState } from '../../src/race/types';
import type { RankingConfig } from './config';
import type { PlayerScore, RaceResult } from '../../src/network/protocol';

export interface RankedFinisher {
  racerId: number;
  playerId?: string;
  name: string;
  finished: boolean;
  forfeited: boolean;
  rank: number;
}
/** Equal progress is a tie; starting grid order must never decide an Elo result. */
export function rankFinishers(options: {
  state: RaceState;
  drivers: { racerId: number; playerId: string; forfeited: boolean }[];
}): RankedFinisher[] {
  const ordered = standings(options.state);
  return ordered.map((racer) => {
    const driver = options.drivers.find((entry) => entry.racerId === racer.id);
    return {
      racerId: racer.id,
      name: racer.name,
      finished: racer.finishedAt !== null,
      forfeited: driver?.forfeited ?? false,
      rank: ordered.findIndex((other) => sameProgress(other, racer)) + 1,
      ...(driver ? { playerId: driver.playerId } : {}),
    };
  });
}

function sameProgress(first: Racer, second: Racer): boolean {
  if (first.finishedAt !== null || second.finishedAt !== null) {
    return first.finishedAt === second.finishedAt;
  }
  return (
    first.health > 0 === second.health > 0 &&
    first.completedLaps === second.completedLaps &&
    first.checkpoint === second.checkpoint
  );
}

/** Pairwise Elo uses one pre-race rating snapshot and normalizes K by human opponents. */
export function scoreRace(
  order: RankedFinisher[],
  players: Map<string, PlayerScore>,
  config: RankingConfig,
  elapsed: number,
): RaceResult[] {
  const humans = order.filter((racer) => racer.playerId !== undefined);
  return order.map((racer) => {
    const player = racer.playerId ? players.get(racer.playerId) : undefined;
    let eloDelta = 0;
    let points = 0;
    if (player && elapsed >= config.minRaceSeconds) {
      for (const rival of humans) {
        if (rival === racer) {
          continue;
        }
        const rating = players.get(rival.playerId!)!.elo;
        const actual = racer.rank === rival.rank ? 0.5 : racer.rank < rival.rank ? 1 : 0;
        const expected = 1 / (1 + 10 ** ((rating - player.elo) / config.scale));
        eloDelta += (config.kFactor * (actual - expected)) / (humans.length - 1);
      }
      if (racer.finished && !racer.forfeited) {
        const beatenAi = order.filter((other) => !other.playerId && other.rank > racer.rank).length;
        points = Math.floor(
          ((config.finishPoints[racer.rank - 1] ?? 0) + beatenAi * config.aiBeatPoints) *
            (humans.length === 1 ? config.soloMultiplier : 1),
        );
      }
    }
    return {
      racerId: racer.racerId,
      name: racer.name,
      position: racer.rank,
      finished: racer.finished,
      eloDelta,
      points,
    };
  });
}
