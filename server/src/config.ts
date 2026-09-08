import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { parseConfig } from '../../src/config/parse';

export const RankingConfigSchema = z
  .object({
    initialElo: z.number().min(0).default(1000),
    kFactor: z.number().positive().max(100).default(32),
    scale: z.number().positive().default(400),
    finishPoints: z.array(z.number().int().nonnegative()).length(6).default([20, 12, 8, 5, 3, 1]),
    aiBeatPoints: z.number().int().nonnegative().default(2),
    soloMultiplier: z.number().min(0).max(1).default(0.5),
    dailyPointsCap: z.number().int().nonnegative().default(200),
    minRaceSeconds: z.number().nonnegative().default(20),
  })
  .strict();
export type RankingConfig = z.infer<typeof RankingConfigSchema>;
export const ServerConfigSchema = z
  .object({
    $schema: z.string().optional(),
    name: z.string().min(1).max(64).default('ToxoDrift server'),
    port: z.number().int().min(1).max(65535).default(2567),
    origins: z
      .array(z.string().url())
      .min(1)
      .default(['http://localhost:5173', 'http://127.0.0.1:5173']),
    trustedProxies: z.array(z.union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()])).default([]),
    httpRequestsPerMinute: z.number().int().positive().default(180),
    patchRate: z.number().int().min(10).max(60).default(20),
    inputRate: z.number().int().min(10).max(70).default(35),
    inputTimeoutMs: z.number().int().min(100).max(5000).default(500),
    reconnectSeconds: z.number().min(0).max(120).default(20),
    lobbyTimeoutSeconds: z.number().positive().default(600),
    finishGraceSeconds: z.number().positive().default(30),
    maxRooms: z.number().int().positive().default(32),
    recoverCooldownMs: z.number().int().min(100).default(3000),
    resultRetentionSeconds: z.number().positive().default(120),
    settlementRetrySeconds: z.number().positive().default(2),
    ranking: RankingConfigSchema.default(() => RankingConfigSchema.parse({})),
  })
  .strict();
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export function loadServerConfig(root: string): ServerConfig {
  return parseConfig({
    text: readFileSync(process.env.SERVER_CONFIG ?? resolve(root, 'config/server.jsonc'), 'utf8'),
    schema: ServerConfigSchema,
    name: 'server.jsonc',
  });
}
