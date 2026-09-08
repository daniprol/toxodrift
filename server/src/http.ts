import express, { type Application } from 'express';
import type { Server as HttpServer } from 'node:http';
import { PlayerNameSchema, PROTOCOL_VERSION } from '../../src/network/protocol';
import type { RaceServices } from './race-room';
import type { ServerConfig } from './config';

export function allowsOrigin(config: ServerConfig, origin: string | undefined): boolean {
  return !origin || config.origins.includes(origin);
}

/** Colyseus routes matchmaking before Express. Wrap its bound Node handler so
 * origin, IP and body limits apply to both routers. Call immediately after listen(). */
export function protectHttp(server: HttpServer, config: ServerConfig): () => void {
  const handlers = server.listeners('request');
  if (handlers.length !== 1) {
    throw new Error('Expected one bound Colyseus HTTP handler');
  }
  const handler = handlers[0]!;
  const app = express();
  const allowedOrigin = (origin: string | undefined) => allowsOrigin(config, origin);
  const rate = new Map<string, { since: number; count: number }>();
  app.set('trust proxy', config.trustedProxies);
  app.use((req, res, next) => {
    if (!allowedOrigin(req.headers.origin)) {
      res.status(403).json({ error: 'Origin not allowed' });
      return;
    }
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(['/api', '/matchmake'], (req, res, next) => {
    const now = Date.now();
    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    let bucket = rate.get(key);
    if (!bucket || now - bucket.since >= 60_000) {
      bucket = { since: now, count: 0 };
      rate.set(key, bucket);
    }
    if (++bucket.count > config.httpRequestsPerMinute) {
      res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
      return;
    }
    if (req.method === 'POST' && !req.is('application/json')) {
      res.status(415).json({ error: 'Requests must use application/json.' });
      return;
    }
    next();
  });
  app.use(express.json({ limit: '4kb' }));
  app.use((req, res) => handler.call(server, req, res));
  server.removeListener('request', handler);
  server.on('request', app);
  const cleanup = setInterval(() => {
    for (const [key, bucket] of rate) {
      if (Date.now() - bucket.since > 60_000) {
        rate.delete(key);
      }
    }
  }, 60_000);
  cleanup.unref();
  return () => clearInterval(cleanup);
}

/** Public HTTP endpoints; process assembly decides whether to also serve the client. */
export function installHttp(app: Application, services: RaceServices): void {
  const { config, assets, store } = services;
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/info', (_req, res) =>
    res.json({
      name: config.name,
      protocol: PROTOCOL_VERSION,
      gameConfig: assets.config,
      manifest: assets.manifest,
      assetVersion: assets.assetVersion,
      inputRate: config.inputRate,
      patchRate: config.patchRate,
      ranking: config.ranking,
    }),
  );
  app.get('/api/races', (_req, res) => res.json([...services.rooms.values()]));
  app.get('/api/leaderboard', (_req, res) => res.json(store.leaderboard()));
  app.post('/api/players', (req, res) => {
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    if (token) {
      const player = store.authenticate(token);
      if (!player) {
        res.status(401).json({ error: 'Driver identity is no longer valid on this server.' });
        return;
      }
      res.json({ token, player });
      return;
    }
    const name = PlayerNameSchema.safeParse(req.body?.name);
    if (!name.success) {
      res.status(400).json({
        error: 'Use a driver name of 1–16 letters, numbers, spaces, dots, dashes or underscores.',
      });
      return;
    }
    res.status(201).json(store.register(name.data));
  });
}
