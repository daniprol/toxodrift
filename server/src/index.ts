import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import express from 'express';
import { loadServerConfig } from './config';
import { loadServerAssets } from './assets';
import { RankingStore } from './store';
import { createRaceRoom, type RaceServices } from './race-room';
import { allowsOrigin, installHttp, protectHttp } from './http';

const root = resolve(process.env.GAME_ROOT ?? '..');
const config = loadServerConfig(root);
if (process.env.ALLOWED_ORIGINS) {
  config.origins = process.env.ALLOWED_ORIGINS.split(',').map(
    (origin) => new URL(origin.trim()).origin,
  );
}
const assets = loadServerAssets(root);
const store = new RankingStore(
  process.env.DATABASE_PATH ?? resolve(root, '.local/server/rankings.sqlite'),
  config.ranking,
);
const services: RaceServices = {
  assets,
  config,
  store,
  rooms: new Map(),
  activePlayers: new Map(),
  activeRooms: new Set(),
};
const http = createServer();
let disposeHttp = () => {};
const gameServer = new Server({
  greet: false,
  transport: new WebSocketTransport({
    server: http,
    maxPayload: 4096,
    beforeUpgrade: (_request, context) => {
      if (!allowsOrigin(config, context.headers.get('origin') ?? undefined)) {
        return new Response('Origin not allowed', { status: 403 });
      }
    },
  }),
  express: (app) => {
    installHttp(app, services);
    if (process.env.SERVE_CLIENT === '1') {
      app.use(express.static(resolve(root, 'dist')));
    }
  },
});
gameServer.define('race', createRaceRoom(services));
gameServer.onShutdown(() => {
  disposeHttp();
  store.close();
});
await gameServer.listen(Number(process.env.PORT ?? config.port), '0.0.0.0');
disposeHttp = protectHttp(http, config);
console.log(`${config.name} listening on port ${process.env.PORT ?? config.port}`);
