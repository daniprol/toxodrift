import { afterAll, expect, it } from 'vitest';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client } from '@colyseus/sdk';
import { createServer } from 'node:http';
import { createRaceRoom, type RaceServices } from '../src/race-room';
import { RankingStore } from '../src/store';
import { ServerConfigSchema } from '../src/config';
import { OnlineState } from '../../src/network/state';
import { IDLE_INPUT } from '../../src/race/types';
import { PROTOCOL_VERSION } from '../../src/network/protocol';
import { gameConfig, openTrack } from '../../tests/helpers/fixtures';

const http = createServer();
const serverConfig = ServerConfigSchema.parse({
  inputTimeoutMs: 100,
  reconnectSeconds: 1,
  ranking: { minRaceSeconds: 0 },
});
const config = gameConfig();
config.race.countdownSeconds = 0;
config.race.maxRaceSeconds = 2;
const track = openTrack();
const store = new RankingStore(':memory:', serverConfig.ranking);
const services: RaceServices = {
  config: serverConfig,
  store,
  assets: {
    config,
    manifest: { version: 1, tracks: [track.definition] },
    tracks: new Map([['tr0', track]]),
    assetVersion: 'test',
  },
  rooms: new Map(),
  activePlayers: new Map(),
  activeRooms: new Set(),
};
const server = new Server({
  greet: false,
  gracefullyShutdown: false,
  transport: new WebSocketTransport({ server: http }),
});
server.define('race', createRaceRoom(services));
let listening = false;
async function client() {
  if (!listening) {
    await server.listen(0, '127.0.0.1');
    listening = true;
  }
  const address = http.address();
  if (!address || typeof address === 'string') {
    throw new Error('Missing test port');
  }
  return new Client(`http://127.0.0.1:${address.port}`);
}
afterAll(async () => {
  await server.gracefullyShutdown(false);
  store.close();
});
async function until(predicate: () => boolean, timeout = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) {
      throw new Error('Timed out waiting for network state');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
const settings = {
  trackId: 'tr0',
  carId: 'vagabond',
  participants: 2,
  ai: 0,
  laps: 1,
  weapons: false,
};
it('authenticates two clients, enforces ready/host rules, routes inputs and broadcasts one persisted result', async () => {
  const sdk = await client();
  const first = store.register('First');
  const second = store.register('Second');
  await expect(
    sdk.create<OnlineState>(
      'race',
      { protocol: PROTOCOL_VERSION, credential: 'invalid', settings },
      OnlineState,
    ),
  ).rejects.toThrow();
  const one = await sdk.create<OnlineState>(
    'race',
    { protocol: PROTOCOL_VERSION, credential: first.token, settings },
    OnlineState,
  );
  const two = await sdk.joinById<OnlineState>(
    one.roomId,
    { protocol: PROTOCOL_VERSION, credential: second.token },
    OnlineState,
  );
  one.onMessage('notice', () => {});
  two.onMessage('notice', () => {});
  one.onMessage('results', () => {});
  two.onMessage('results', () => {});
  try {
    await until(() => one.state.drivers.length === 2 && two.state.drivers.length === 2);
    expect(services.rooms.get(one.roomId)?.clients).toBe(2);
    await expect(
      sdk.joinById<OnlineState>(
        one.roomId,
        { protocol: PROTOCOL_VERSION, credential: first.token },
        OnlineState,
      ),
    ).rejects.toThrow();
    one.send('start');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(one.state.phase).toBe('lobby');
    one.send('ready', true);
    two.send('ready', true);
    await until(() => one.state.drivers.every((driver) => driver.ready));
    two.send('start');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(one.state.phase).toBe('lobby');
    one.send('start');
    await until(() => one.state.phase === 'racing' && two.state.cars.length === 2);
    two.send('input', { ...IDLE_INPUT, sequence: 1, accelerate: true });
    await until(() => one.state.cars[1]!.speed > 0);
    expect(one.state.cars[0]!.speed).toBe(0);
    const speed = one.state.cars[1]!.speed;
    two.send('input', { ...IDLE_INPUT, sequence: 0, accelerate: true });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(one.state.cars[1]!.speed).toBeLessThan(speed * 2);
    expect(services.rooms.has(one.roomId)).toBe(false);
    await until(() => one.state.phase === 'finished' && two.state.phase === 'finished');
    expect(one.state.results).toBe(two.state.results);
    expect(JSON.parse(one.state.results)).toHaveLength(2);
    expect(store.authenticate(first.token)!.races).toBe(1);
    expect(store.authenticate(second.token)!.races).toBe(1);
  } finally {
    await one.leave();
    await two.leave();
  }
});
it('transfers lobby ownership when the host leaves and releases driver identities', async () => {
  const sdk = await client();
  const first = store.register('Host');
  const second = store.register('Guest');
  const one = await sdk.create<OnlineState>(
    'race',
    { protocol: PROTOCOL_VERSION, credential: first.token, settings },
    OnlineState,
  );
  const two = await sdk.joinById<OnlineState>(
    one.roomId,
    { protocol: PROTOCOL_VERSION, credential: second.token },
    OnlineState,
  );
  try {
    await until(() => two.state.drivers.length === 2);
    await one.leave();
    await until(() => two.state.host === two.sessionId);
    expect(two.state.drivers).toHaveLength(1);
    expect(services.activePlayers.has(first.player.id)).toBe(false);
  } finally {
    await two.leave();
  }
});
it('reserves a dropped seat and reconnects the same driver without creating another slot', async () => {
  const sdk = await client();
  const identity = store.register('Reconnect');
  const room = await sdk.create<OnlineState>(
    'race',
    { protocol: PROTOCOL_VERSION, credential: identity.token, settings: { ...settings, ai: 1 } },
    OnlineState,
  );
  room.reconnection.minUptime = 0;
  let dropped = false;
  let reconnected = false;
  room.onDrop(() => {
    dropped = true;
  });
  room.onReconnect(() => {
    reconnected = true;
  });
  try {
    await until(() => room.state.drivers.length === 1);
    const sessionId = room.sessionId;
    room.connection.close(4010, 'test network interruption');
    await until(() => dropped && reconnected && room.state.drivers[0]!.connected);
    expect(room.sessionId).toBe(sessionId);
    expect(room.state.drivers).toHaveLength(1);
    expect(services.activePlayers.get(identity.player.id)).toBe(room.roomId);
  } finally {
    if (room.connection.isOpen) {
      await room.leave();
    }
  }
});

it('keeps a dropped driver’s grace period when the last connected driver leaves', async () => {
  const sdk = await client();
  const first = store.register('Departing');
  const second = store.register('Offline');
  const one = await sdk.create<OnlineState>(
    'race',
    { protocol: PROTOCOL_VERSION, credential: first.token, settings },
    OnlineState,
  );
  const two = await sdk.joinById<OnlineState>(
    one.roomId,
    { protocol: PROTOCOL_VERSION, credential: second.token },
    OnlineState,
  );
  one.onMessage('results', () => {});
  try {
    await until(() => one.state.drivers.length === 2);
    one.send('ready', true);
    two.send('ready', true);
    await until(() => one.state.drivers.every((driver) => driver.ready));
    one.send('start');
    await until(() => two.state.phase === 'racing');
    two.reconnection.enabled = false;
    two.connection.close(4010, 'network unavailable');
    await until(() => one.state.drivers.some((driver) => !driver.connected));
    await one.leave();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(store.authenticate(second.token)!.races).toBe(0);
    expect(services.activePlayers.has(second.player.id)).toBe(true);
    await until(() => store.authenticate(second.token)!.races === 1);
  } finally {
    if (one.connection.isOpen) {
      await one.leave();
    }
    if (two.connection.isOpen) {
      await two.leave();
    }
  }
});
