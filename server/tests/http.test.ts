import { afterEach, expect, it } from 'vitest';
import { Server, Room } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { createServer } from 'node:http';
import { installHttp, protectHttp } from '../src/http';
import { ServerConfigSchema } from '../src/config';
import type { RaceServices } from '../src/race-room';
import { RankingStore } from '../src/store';
import { gameConfig, openTrack } from '../../tests/helpers/fixtures';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup();
  }
});

async function start(trustedProxies: string[] = []) {
  const config = ServerConfigSchema.parse({ trustedProxies, httpRequestsPerMinute: 2 });
  const store = new RankingStore(':memory:', config.ranking);
  const track = openTrack();
  const services: RaceServices = {
    config,
    store,
    rooms: new Map(),
    activePlayers: new Map<string, string>(),
    activeRooms: new Set(),
    assets: {
      config: gameConfig(),
      manifest: { version: 1, tracks: [track.definition] },
      tracks: new Map(),
      assetVersion: 'test',
    },
  };
  const server = createServer();
  const gameServer = new Server({
    greet: false,
    gracefullyShutdown: false,
    transport: new WebSocketTransport({ server }),
    express: (app) => {
      installHttp(app, services);
      app.get('/asset.png', (_req, res) => res.send('image'));
    },
  });
  gameServer.define('test', Room);
  await gameServer.listen(0, '127.0.0.1');
  const dispose = protectHttp(server, config);
  cleanups.push(async () => {
    dispose();
    await gameServer.gracefullyShutdown(false);
    store.close();
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Missing test port');
  }
  return (path: string, init?: RequestInit) =>
    fetch(`http://127.0.0.1:${address.port}${path}`, init);
}

it('limits API and matchmaking together without blocking assets or health checks', async () => {
  const request = await start();
  expect((await request('/api/info')).status).toBe(200);
  expect(
    (
      await request('/matchmake/create/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    ).status,
  ).toBe(200);
  expect((await request('/api/races')).status).toBe(429);
  expect((await request('/matchmake/create/test', { method: 'POST' })).status).toBe(429);
  expect((await request('/health')).status).toBe(200);
  expect((await request('/asset.png')).status).toBe(200);
});

it('ignores forwarded IPs from untrusted peers', async () => {
  const request = await start();
  for (const ip of ['192.0.2.1', '192.0.2.2']) {
    expect((await request('/api/races', { headers: { 'X-Forwarded-For': ip } })).status).toBe(200);
  }
  expect(
    (await request('/api/races', { headers: { 'X-Forwarded-For': '192.0.2.3' } })).status,
  ).toBe(429);
});

it('separates clients behind an explicitly trusted proxy and enforces origins', async () => {
  const request = await start(['127.0.0.1/32']);
  const first = { headers: { 'X-Forwarded-For': '192.0.2.1' } };
  expect((await request('/api/races', first)).status).toBe(200);
  expect((await request('/api/races', first)).status).toBe(200);
  expect((await request('/api/races', first)).status).toBe(429);
  expect(
    (await request('/api/races', { headers: { 'X-Forwarded-For': '192.0.2.2' } })).status,
  ).toBe(200);
  expect(
    (await request('/api/info', { headers: { Origin: 'https://unlisted.example' } })).status,
  ).toBe(403);
});

it('rejects disallowed origins and oversized bodies at the real matchmaking boundary', async () => {
  const request = await start();
  expect(
    (
      await request('/matchmake/create/test', {
        method: 'POST',
        headers: { Origin: 'https://unlisted.example', 'Content-Type': 'application/json' },
        body: '{}',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await request('/matchmake/create/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ padding: 'x'.repeat(5000) }),
      })
    ).status,
  ).toBe(413);
});

it('supports SDK credentialed preflight and rejects alternate body formats', async () => {
  const request = await start();
  const preflight = await request('/matchmake/create/test', {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
  expect(preflight.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  expect(
    (
      await request('/matchmake/create/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/problem+json' },
        body: JSON.stringify({ padding: 'x'.repeat(5000) }),
      })
    ).status,
  ).toBe(415);
});
