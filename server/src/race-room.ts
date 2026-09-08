import { Room, ServerError, type Client } from '@colyseus/core';
import { Race } from '../../src/race/race';
import { rankFinishers } from './rankings';
import { IDLE_INPUT, type DriverInput } from '../../src/race/types';
import {
  InputSchema,
  PROTOCOL_VERSION,
  RaceSettingsSchema,
  type PlayerScore,
  type RaceSettings,
  type RoomListing,
} from '../../src/network/protocol';
import { LobbyDriver, OnlineState, syncRace } from '../../src/network/state';
import type { ServerAssets } from './assets';
import type { ServerConfig } from './config';
import type { RankingStore } from './store';

interface Seat {
  player: PlayerScore;
  racerId: number;
  sequence: number;
  receivedAt: number;
  input: DriverInput;
  recoveredAt: number;
  forfeited: boolean;
}
export interface RaceServices {
  assets: ServerAssets;
  config: ServerConfig;
  store: RankingStore;
  rooms: Map<string, RoomListing>;
  activePlayers: Map<string, string>;
  activeRooms: Set<string>;
}

export function createRaceRoom(services: RaceServices) {
  const { assets, config, store } = services;
  return class RaceRoom extends Room<{ state: OnlineState; metadata: RaceSettings }> {
    state = new OnlineState();
    private settings!: RaceSettings;
    private race?: Race;
    private seats = new Map<string, Seat>();
    private firstFinisherAt = -1;
    private shuttingDown = false;

    static override async onAuth(
      _token: string,
      options: { credential?: string; protocol?: number },
    ) {
      if (options.protocol !== PROTOCOL_VERSION) {
        throw new ServerError(400, 'Incompatible game version. Reload or update the game.');
      }
      const player = store.authenticate(options.credential);
      if (!player) {
        throw new ServerError(401, 'Choose a driver identity before joining.');
      }
      return player;
    }

    async onCreate(options: { settings?: unknown }) {
      if (services.activeRooms.size >= config.maxRooms) {
        throw new ServerError(503, 'Server has reached its race limit.');
      }
      services.activeRooms.add(this.roomId);
      const parsed = RaceSettingsSchema.safeParse(options.settings);
      if (!parsed.success) {
        throw new ServerError(400, 'Invalid race settings');
      }
      this.settings = parsed.data;
      const track = assets.tracks.get(this.settings.trackId);
      if (!track || !assets.config.cars.some((car) => car.id === this.settings.carId)) {
        throw new ServerError(400, 'Unknown circuit or car');
      }
      // Validate the grid now so an unsupported circuit never strands a ready lobby.
      new Race({
        track,
        config: assets.config,
        carId: this.settings.carId,
        laps: this.settings.laps,
        opponents: this.settings.participants - 1,
        weapons: this.settings.weapons,
      });
      this.maxClients = this.settings.participants - this.settings.ai;
      this.maxMessagesPerSecond = config.inputRate * 2 + 20;
      this.patchRate = 1000 / config.patchRate;
      this.state.settings = JSON.stringify(this.settings);
      await this.setMetadata(this.settings);
      this.updateListing();
      this.clock.setTimeout(() => {
        if (!this.race) {
          void this.disconnect();
        }
      }, config.lobbyTimeoutSeconds * 1000);
      this.onMessage('ready', (client, ready: unknown) => {
        if (this.state.phase !== 'lobby' || typeof ready !== 'boolean') {
          return;
        }
        const driver = this.state.drivers.find((entry) => entry.sessionId === client.sessionId);
        if (driver) {
          driver.ready = ready;
        }
      });
      this.onMessage('start', (client) => {
        if (client.sessionId !== this.state.host || this.state.phase !== 'lobby') {
          return;
        }
        if (
          this.state.drivers.length !== this.maxClients ||
          !this.state.drivers.every((driver) => driver.ready && driver.connected)
        ) {
          client.send(
            'notice',
            'All human slots must be occupied and ready. Create a race with more AI to play with fewer humans.',
          );
          return;
        }
        this.startRace();
      });
      this.onMessage('input', (client, message: unknown) => {
        const seat = this.seats.get(client.sessionId);
        if (!seat || seat.forfeited || !this.race || this.state.phase === 'finished') {
          return;
        }
        const parsedInput = InputSchema.safeParse(message);
        if (!parsedInput.success || parsedInput.data.sequence <= seat.sequence) {
          return;
        }
        seat.sequence = parsedInput.data.sequence;
        seat.receivedAt = this.clock.elapsedTime;
        seat.input = {
          ...parsedInput.data,
          steering:
            parsedInput.data.steering ??
            Number(parsedInput.data.left) - Number(parsedInput.data.right),
        };
      });
      this.onMessage('recover', (client) => {
        const seat = this.seats.get(client.sessionId);
        if (
          !seat ||
          seat.forfeited ||
          this.clock.elapsedTime - seat.recoveredAt < config.recoverCooldownMs
        ) {
          return;
        }
        this.race?.recoverPlayer(seat.racerId);
        seat.recoveredAt = this.clock.elapsedTime;
      });
    }

    onJoin(client: Client) {
      const player = client.auth as PlayerScore;
      if (
        this.state.phase !== 'lobby' ||
        this.seats.size >= this.maxClients ||
        services.activePlayers.has(player.id)
      ) {
        throw new ServerError(409, 'This driver is already racing, or the race has started.');
      }
      services.activePlayers.set(player.id, this.roomId);
      const ids = new Set([...this.seats.values()].map((seat) => seat.racerId));
      let racerId = 0;
      while (ids.has(racerId)) {
        racerId++;
      }
      this.seats.set(client.sessionId, {
        player,
        racerId,
        sequence: -1,
        receivedAt: -Infinity,
        input: IDLE_INPUT,
        recoveredAt: -Infinity,
        forfeited: false,
      });
      this.state.drivers.push(
        new LobbyDriver().assign({
          sessionId: client.sessionId,
          racerId,
          name: player.name,
          ready: false,
          connected: true,
        }),
      );
      if (!this.state.host) {
        this.state.host = client.sessionId;
      }
      this.updateListing();
    }

    async onDrop(client: Client) {
      const driver = this.state.drivers.find((entry) => entry.sessionId === client.sessionId);
      const seat = this.seats.get(client.sessionId);
      if (driver) {
        driver.connected = false;
      }
      if (seat) {
        seat.input = IDLE_INPUT;
      }
      try {
        await this.allowReconnection(client, config.reconnectSeconds);
      } catch {
        /* onLeave handles an expired reservation. */
      }
    }
    onReconnect(client: Client) {
      const driver = this.state.drivers.find((entry) => entry.sessionId === client.sessionId);
      if (driver) {
        driver.connected = true;
      }
    }
    onLeave(client: Client) {
      const seat = this.seats.get(client.sessionId);
      if (!seat) {
        return;
      }
      if (
        (!this.race || this.state.results || this.shuttingDown) &&
        services.activePlayers.get(seat.player.id) === this.roomId
      ) {
        services.activePlayers.delete(seat.player.id);
      }
      if (this.shuttingDown) {
        return;
      }
      if (!this.race) {
        this.seats.delete(client.sessionId);
        const index = this.state.drivers.findIndex(
          (driver) => driver.sessionId === client.sessionId,
        );
        if (index >= 0) {
          this.state.drivers.splice(index, 1);
        }
        if (this.state.host === client.sessionId) {
          this.state.host = this.state.drivers[0]?.sessionId ?? '';
        }
        this.updateListing();
      } else {
        seat.input = IDLE_INPUT;
        seat.forfeited ||= this.race.forfeitDriver(seat.racerId);
        // The fixed loop continues while other seats reconnect or AI finish.
        // autoDispose is disabled for running races; departing clients cannot end their grace.
      }
    }
    async onBeforeShutdown() {
      this.shuttingDown = true;
      await this.disconnect();
    }
    onDispose() {
      services.rooms.delete(this.roomId);
      services.activeRooms.delete(this.roomId);
      for (const seat of this.seats.values()) {
        if (services.activePlayers.get(seat.player.id) === this.roomId) {
          services.activePlayers.delete(seat.player.id);
        }
      }
    }
    private updateListing() {
      services.rooms.set(this.roomId, {
        roomId: this.roomId,
        clients: this.state.drivers.length,
        maxClients: this.maxClients,
        metadata: this.settings,
      });
    }
    private startRace() {
      this.autoDispose = false;
      void this.lock();
      services.rooms.delete(this.roomId);
      this.race = new Race({
        track: assets.tracks.get(this.settings.trackId)!,
        config: assets.config,
        carId: this.settings.carId,
        laps: this.settings.laps,
        opponents: this.settings.participants - 1,
        weapons: this.settings.weapons,
        drivers: [...this.seats.values()].map((seat) => ({
          id: seat.racerId,
          name: seat.player.name,
          carId: this.settings.carId,
        })),
      });
      syncRace(this.state, this.race.state);
      this.setFixedTimestep(() => {
        if (!this.race || this.state.phase === 'finished') {
          return;
        }
        const inputs = new Map<number, DriverInput>();
        for (const seat of this.seats.values()) {
          inputs.set(
            seat.racerId,
            this.clock.elapsedTime - seat.receivedAt > config.inputTimeoutMs
              ? IDLE_INPUT
              : seat.input,
          );
        }
        this.race.step(IDLE_INPUT, inputs);
        if (this.race.state.finishOrder.length > 0 && this.firstFinisherAt < 0) {
          this.firstFinisherAt = this.race.state.elapsed;
        }
        if (
          this.race.state.phase === 'finished' ||
          (this.firstFinisherAt >= 0 &&
            this.race.state.elapsed - this.firstFinisherAt >= config.finishGraceSeconds)
        ) {
          this.finish();
        }
        syncRace(this.state, this.race.state);
      }, assets.config.race.tickRate);
    }
    private finish() {
      if (!this.race || this.state.results) {
        return;
      }
      this.race.finish();
      try {
        const results = store.settle(
          this.roomId,
          rankFinishers({
            state: this.race.state,
            drivers: [...this.seats.values()].map((seat) => ({
              racerId: seat.racerId,
              playerId: seat.player.id,
              forfeited: seat.forfeited,
            })),
          }),
          this.race.state.elapsed,
        );
        this.state.results = JSON.stringify(results);
        syncRace(this.state, this.race.state);
        this.broadcast('results', results);
        for (const seat of this.seats.values()) {
          if (services.activePlayers.get(seat.player.id) === this.roomId) {
            services.activePlayers.delete(seat.player.id);
          }
        }
        this.clock.setTimeout(() => void this.disconnect(), config.resultRetentionSeconds * 1000);
      } catch (error) {
        console.error(`Unable to save race ${this.roomId}; retrying`, error);
        syncRace(this.state, this.race.state);
        this.broadcast('notice', 'Results are waiting to be saved. Retrying…');
        this.clock.setTimeout(() => this.finish(), config.settlementRetrySeconds * 1000);
      }
    }
  };
}
