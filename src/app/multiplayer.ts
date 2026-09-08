import { z } from 'zod';
import { loadRaceAssets, type RaceAssets } from '../assets/browser-loader';
import { type GameConfig } from '../config/schemas/game';
import { type AssetManifest } from '../config/schemas/track';
import { RaceSettingsSchema, RaceResultSchema, type RaceSettings } from '../network/protocol';
import { RaceServer } from '../network/server-client';
import type { OnlineRoom } from '../network/remote-race';
import {
  normalizeServerUrl,
  savedServers,
  saveServer,
  type MultiplayerConfig,
} from '../network/servers';
import { element } from './view';

const html = (id: string) => element(id, HTMLElement);
const select = (id: string) => element(id, HTMLSelectElement);
const input = (id: string) => element(id, HTMLInputElement);
export interface OnlineStart {
  assets: RaceAssets;
  config: GameConfig;
  settings: RaceSettings;
  room: OnlineRoom;
  racerId: number;
  inputRate: number;
  interpolationMs: number;
}

/** Server discovery and lobby lifecycle; rendering remains in RaceSession. */
export class Multiplayer {
  private server: RaceServer | undefined;
  private get info() {
    return this.server?.info;
  }
  private room: OnlineRoom | undefined;
  private assets: RaceAssets | undefined;
  private settings: RaceSettings | undefined;
  private started = false;
  private busy = false;
  private generation = 0;
  private refreshTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly options: {
      config: MultiplayerConfig;
      manifest: AssetManifest;
      onStart: (options: OnlineStart) => void;
      onMenu: () => void;
    },
  ) {
    html('add-server').addEventListener('submit', (event) => {
      event.preventDefault();
      this.run(async () => {
        const url = normalizeServerUrl(input('server-address').value.trim());
        saveServer({ name: new URL(url).host, url }, options.config);
        this.refreshServers();
        select('server-list').value = url;
        input('server-address').value = '';
      });
    });
    html('connect-server').addEventListener('click', () => this.run(() => this.connect()));
    html('refresh-races').addEventListener('click', () => this.run(() => this.refreshRaces()));
    html('show-leaderboard').addEventListener('click', () => this.run(() => this.leaderboard()));
    html('online-create').addEventListener('submit', (event) => {
      event.preventDefault();
      this.run(() => this.join());
    });
    select('online-participants').addEventListener('change', () => this.aiOptions());
    html('online-ready').addEventListener('change', () =>
      this.room?.send('ready', input('online-ready').checked),
    );
    html('online-start').addEventListener('click', () => this.room?.send('start'));
    html('online-back').addEventListener('click', () =>
      this.run(async () => {
        if (this.room) {
          await this.leave();
          this.panel('races');
          await this.refreshRaces();
        } else if (!html('leaderboard-panel').hidden) {
          this.panel('races');
        } else if (!html('races-panel').hidden) {
          this.server = undefined;
          this.panel('servers');
        } else {
          this.hide();
          options.onMenu();
        }
      }),
    );
    this.aiOptions();
  }
  show(): void {
    html('multiplayer').hidden = false;
    this.refreshServers();
    this.panel(this.info ? 'races' : 'servers');
    this.refreshTimer ??= setInterval(() => {
      if (!html('races-panel').hidden && !this.busy && !html('multiplayer').hidden) {
        this.run(() => this.refreshRaces());
      }
    }, 5000);
  }
  hide(): void {
    html('multiplayer').hidden = true;
    clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;
  }
  async leave(): Promise<void> {
    this.generation++;
    const room = this.room;
    this.room = undefined;
    this.assets = undefined;
    this.settings = undefined;
    this.started = false;
    if (room) {
      room.reconnection.enabled = false;
      if (room.connection.isOpen) {
        await room.leave();
      } else {
        room.connection.close(4000);
      }
    }
    html('network-status').hidden = true;
    if (this.info) {
      this.panel('races');
    }
  }
  private panel(name: string) {
    for (const panel of ['servers', 'races', 'lobby', 'leaderboard']) {
      html(`${panel}-panel`).hidden = panel !== name;
    }
    html('online-title').textContent =
      name === 'servers' ? 'Multiplayer' : `${this.info?.name ?? 'Multiplayer'} · ${name}`;
    html('online-status').textContent = '';
  }
  private run(action: () => Promise<void>): void {
    if (this.busy) {
      return;
    }
    this.busy = true;
    html('multiplayer').setAttribute('aria-busy', 'true');
    void action()
      .catch((error: unknown) => {
        html('online-status').textContent = error instanceof Error ? error.message : String(error);
      })
      .finally(() => {
        this.busy = false;
        html('multiplayer').setAttribute('aria-busy', 'false');
      });
  }
  private refreshServers() {
    const current = select('server-list').value;
    const servers = savedServers(this.options.config);
    select('server-list').replaceChildren(
      ...servers.map((server) => new Option(`${server.name} · ${server.url}`, server.url)),
    );
    if (servers.some((server) => server.url === current)) {
      select('server-list').value = current;
    }
    element('connect-server', HTMLButtonElement).disabled = servers.length === 0;
    if (!servers.length) {
      html('online-status').textContent = 'Add a server address to get started.';
    }
  }
  private async connect() {
    html('online-status').textContent = 'Connecting…';
    this.server = await RaceServer.connect({
      url: select('server-list').value,
      name: input('driver-name').value,
      manifest: this.options.manifest,
    });
    const { info, playerName } = this.server;
    input('driver-name').value = playerName;
    select('online-track').replaceChildren(
      ...info.manifest.tracks.map((track) => new Option(track.name, track.id)),
    );
    select('online-car').replaceChildren(
      ...info.gameConfig.cars.map((car) => new Option(car.name, car.id)),
    );
    select('online-track').value = info.gameConfig.race.defaultTrack;
    select('online-car').value = info.gameConfig.race.defaultCar;
    input('online-laps').value = String(info.gameConfig.race.laps);
    input('online-weapons').checked = info.gameConfig.race.weapons;
    this.panel('races');
    await this.refreshRaces();
  }
  private aiOptions() {
    const total = Number(select('online-participants').value);
    select('online-ai').replaceChildren(
      ...Array.from({ length: total }, (_, count) => new Option(String(count), String(count))),
    );
    select('online-ai').value = String(total - 1);
  }
  private async refreshRaces() {
    const rooms = await this.server!.races();
    html('open-races').replaceChildren(
      ...rooms.map((room) => {
        const button = document.createElement('button');
        button.type = 'button';
        const track = this.info?.manifest.tracks.find(
          (entry) => entry.id === room.metadata.trackId,
        );
        button.textContent = `${track?.name ?? room.metadata.trackId} · ${room.clients}/${room.maxClients} drivers · ${room.metadata.ai} AI`;
        button.disabled = room.clients >= room.maxClients;
        button.addEventListener('click', () => this.run(() => this.join(room.roomId)));
        return button;
      }),
    );
    if (!rooms.length) {
      html('open-races').textContent =
        'No open races. Create one to race with AI or invite friends.';
    }
  }
  private async join(roomId?: string) {
    if (!this.server || this.room) {
      return;
    }
    const room = await this.server.enter(
      roomId
        ? { roomId }
        : {
            settings: RaceSettingsSchema.parse({
              trackId: select('online-track').value,
              carId: select('online-car').value,
              participants: Number(select('online-participants').value),
              ai: Number(select('online-ai').value),
              laps: input('online-laps').valueAsNumber,
              weapons: input('online-weapons').checked,
            }),
          },
    );
    this.room = room;
    const generation = ++this.generation;
    this.panel('lobby');
    input('online-ready').disabled = true;
    input('online-ready').checked = false;
    room.onMessage('notice', (message: string) => {
      html('online-status').textContent = message;
    });
    room.onMessage('results', () => this.showResults());
    room.onDrop(() => {
      html('network-status').hidden = false;
      html('network-status').textContent =
        'Connection lost. Reconnecting… Your car has stopped receiving controls.';
      html('online-status').textContent = 'Reconnecting…';
    });
    room.onReconnect(() => {
      html('network-status').hidden = true;
      html('online-status').textContent = '';
    });
    room.onLeave(() => {
      if (this.room !== room) {
        return;
      }
      html('network-status').hidden = false;
      html('network-status').textContent =
        'Disconnected from the server. Return to Multiplayer to join another race.';
      this.room = undefined;
      if (!this.started) {
        this.panel('races');
        html('online-status').textContent = 'Race closed or connection expired.';
      }
    });
    room.onError((_code, message) => {
      html('online-status').textContent = message ?? 'Connection error';
    });
    room.onStateChange(() => this.updateLobby());
    try {
      if (!room.state.settings) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('Timed out loading the race.')),
            10_000,
          );
          room.onStateChange.once(() => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }
      this.settings = RaceSettingsSchema.parse(JSON.parse(room.state.settings));
      const definition = this.server.info.manifest.tracks.find(
        (track) => track.id === this.settings!.trackId,
      )!;
      this.assets = await loadRaceAssets({ definition, config: this.server.info.gameConfig });
      if (generation !== this.generation || this.room !== room) {
        return;
      }
      input('online-ready').disabled = false;
      this.updateLobby();
    } catch (error) {
      await this.leave();
      throw error;
    }
  }
  private updateLobby() {
    const room = this.room;
    if (!room) {
      return;
    }
    html('lobby-settings').textContent = this.settings
      ? `${this.info?.manifest.tracks.find((track) => track.id === this.settings!.trackId)?.name} · ${this.settings.participants} cars · ${this.settings.ai} AI · ${this.settings.laps} laps`
      : 'Loading circuit…';
    html('lobby-drivers').replaceChildren(
      ...room.state.drivers.map((driver) => {
        const row = document.createElement('li');
        row.textContent = `${driver.name}${driver.sessionId === room.sessionId ? ' (you)' : ''} · ${!driver.connected ? 'reconnecting' : driver.ready ? 'ready' : 'not ready'}`;
        return row;
      }),
    );
    const humans = this.settings ? this.settings.participants - this.settings.ai : 0;
    html('lobby-slots').textContent = `${room.state.drivers.length}/${humans} human slots occupied`;
    element('online-start', HTMLButtonElement).hidden = room.state.host !== room.sessionId;
    element('online-start', HTMLButtonElement).disabled =
      !this.assets ||
      room.state.drivers.length !== humans ||
      !room.state.drivers.every((driver) => driver.ready && driver.connected);
    if (
      room.state.phase !== 'lobby' &&
      this.assets &&
      this.settings &&
      this.info &&
      !this.started
    ) {
      const driver = room.state.drivers.find((entry) => entry.sessionId === room.sessionId);
      if (!driver) {
        return;
      }
      this.started = true;
      this.hide();
      this.options.onStart({
        assets: this.assets,
        config: this.info.gameConfig,
        settings: this.settings,
        room,
        racerId: driver.racerId,
        inputRate: this.info.inputRate,
        interpolationMs: this.options.config.interpolationMs,
      });
    }
    this.showResults();
  }
  private showResults() {
    if (!this.room?.state.results) {
      return;
    }
    const results = z.array(RaceResultSchema).parse(JSON.parse(this.room.state.results));
    const id = this.room.state.drivers.find(
      (driver) => driver.sessionId === this.room!.sessionId,
    )?.racerId;
    const result = results.find((entry) => entry.racerId === id);
    if (result) {
      html('network-status').hidden = false;
      html('network-status').textContent =
        `Result: ${result.position}/${results.length} · Elo ${result.eloDelta >= 0 ? '+' : ''}${result.eloDelta.toFixed(1)} · +${result.points} points`;
    }
  }
  private async leaderboard() {
    const players = await this.server!.leaderboard();
    this.panel('leaderboard');
    html('leaderboard-rows').replaceChildren(
      ...players.map((player) => {
        const row = document.createElement('tr');
        for (const value of [player.name, Math.round(player.elo), player.points, player.wins]) {
          const cell = document.createElement('td');
          cell.textContent = String(value);
          row.append(cell);
        }
        return row;
      }),
    );
    if (!players.length) {
      html('online-status').textContent = 'No ranked drivers yet.';
    }
  }
}
