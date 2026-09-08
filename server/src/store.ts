import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PlayerScore, RaceResult } from '../../src/network/protocol';
import type { RankingConfig } from './config';
import { scoreRace, type RankedFinisher } from './rankings';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
/** SQLite owns identities and atomic, idempotent result settlement for one server. */
export class RankingStore {
  private readonly db: DatabaseSync;
  constructor(
    path: string,
    private readonly config: RankingConfig,
  ) {
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, name TEXT NOT NULL, elo REAL NOT NULL, points INTEGER NOT NULL DEFAULT 0, races INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS results (race_id TEXT PRIMARY KEY, result TEXT NOT NULL, audit TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS daily_points (player_id TEXT NOT NULL, day TEXT NOT NULL, points INTEGER NOT NULL, PRIMARY KEY (player_id, day));`);
  }
  register(name: string) {
    const token = randomBytes(32).toString('hex');
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO players (id, token_hash, name, elo) VALUES (?, ?, ?, ?)')
      .run(id, hash(token), name, this.config.initialElo);
    return { token, player: this.authenticate(token)! };
  }
  authenticate(token: unknown): PlayerScore | undefined {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      return undefined;
    }
    return this.db
      .prepare('SELECT id, name, elo, points, races, wins FROM players WHERE token_hash = ?')
      .get(hash(token)) as PlayerScore | undefined;
  }
  leaderboard(): PlayerScore[] {
    return this.db
      .prepare(
        'SELECT id, name, elo, points, races, wins FROM players ORDER BY elo DESC, points DESC, id LIMIT 100',
      )
      .all() as unknown as PlayerScore[];
  }
  settle(raceId: string, order: RankedFinisher[], elapsed: number): RaceResult[] {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const saved = this.db.prepare('SELECT result FROM results WHERE race_id = ?').get(raceId);
      if (saved) {
        this.db.exec('COMMIT');
        return JSON.parse(String(saved.result));
      }
      const players = new Map<string, PlayerScore>();
      for (const racer of order) {
        if (racer.playerId) {
          players.set(
            racer.playerId,
            this.db
              .prepare('SELECT id, name, elo, points, races, wins FROM players WHERE id = ?')
              .get(racer.playerId) as unknown as PlayerScore,
          );
        }
      }
      const results = scoreRace(order, players, this.config, elapsed);
      const day = new Date().toISOString().slice(0, 10);
      for (const [index, racer] of order.entries()) {
        if (!racer.playerId) {
          continue;
        }
        const result = results[index]!;
        const used = Number(
          this.db
            .prepare('SELECT points FROM daily_points WHERE player_id = ? AND day = ?')
            .get(racer.playerId, day)?.points ?? 0,
        );
        result.points = Math.min(result.points, Math.max(0, this.config.dailyPointsCap - used));
        this.db
          .prepare(
            'INSERT INTO daily_points VALUES (?, ?, ?) ON CONFLICT(player_id, day) DO UPDATE SET points = points + excluded.points',
          )
          .run(racer.playerId, day, result.points);
        this.db
          .prepare(
            'UPDATE players SET elo = elo + ?, points = points + ?, races = races + 1, wins = wins + ? WHERE id = ?',
          )
          .run(
            result.eloDelta,
            result.points,
            Number(racer.rank === 1 && racer.finished && !racer.forfeited),
            racer.playerId,
          );
      }
      this.db.prepare('INSERT INTO results VALUES (?, ?, ?)').run(
        raceId,
        JSON.stringify(results),
        JSON.stringify({
          version: 1,
          order,
          elapsed,
          rules: this.config,
          before: [...players.values()],
        }),
      );
      this.db.exec('COMMIT');
      return results;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  close(): void {
    this.db.close();
  }
}
