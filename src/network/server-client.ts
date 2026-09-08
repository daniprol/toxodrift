import { Client } from '@colyseus/sdk';
import { z } from 'zod';
import { GameConfigSchema } from '../config/schemas/game';
import { ManifestSchema, type AssetManifest } from '../config/schemas/track';
import {
  PROTOCOL_VERSION,
  PlayerScoreSchema,
  RoomListingSchema,
  type RaceSettings,
} from './protocol';
import { OnlineState } from './state';
import type { OnlineRoom } from './remote-race';
import { identityKey, normalizeServerUrl } from './servers';

const ServerInfoSchema = z.object({
  name: z.string(),
  protocol: z.literal(PROTOCOL_VERSION),
  gameConfig: GameConfigSchema,
  manifest: ManifestSchema,
  inputRate: z.number().min(10).max(70),
  patchRate: z.number().min(10).max(60),
});
const IdentitySchema = z.object({ token: z.string().min(1), player: PlayerScoreSchema });
type ServerInfo = z.infer<typeof ServerInfoSchema>;

/** Validates the HTTP boundary and keeps guest credentials scoped to one server origin. */
export class RaceServer {
  private constructor(
    private readonly options: {
      info: ServerInfo;
      playerName: string;
      endpoint: string;
      credential: string;
    },
  ) {}

  get info() {
    return this.options.info;
  }
  get playerName() {
    return this.options.playerName;
  }

  static async connect(options: {
    url: string;
    name: string;
    manifest: AssetManifest;
  }): Promise<RaceServer> {
    const endpoint = normalizeServerUrl(options.url);
    const info = ServerInfoSchema.parse(await request(endpoint, '/api/info'));
    if (JSON.stringify(info.manifest) !== JSON.stringify(options.manifest)) {
      throw new Error('Server circuit assets differ from this game. Use a matching game build.');
    }
    const saved = localStorage.getItem(identityKey(endpoint));
    const identity = IdentitySchema.parse(
      await request(endpoint, '/api/players', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(saved ? { Authorization: `Bearer ${saved}` } : {}),
        },
        body: JSON.stringify({ name: options.name }),
      }),
    );
    localStorage.setItem(identityKey(endpoint), identity.token);
    return new RaceServer({
      info,
      playerName: identity.player.name,
      endpoint,
      credential: identity.token,
    });
  }

  async races() {
    return z.array(RoomListingSchema).parse(await request(this.options.endpoint, '/api/races'));
  }
  async leaderboard() {
    return z
      .array(PlayerScoreSchema)
      .parse(await request(this.options.endpoint, '/api/leaderboard'));
  }
  async enter(options: { roomId: string } | { settings: RaceSettings }): Promise<OnlineRoom> {
    const client = new Client(this.options.endpoint);
    const auth = { credential: this.options.credential, protocol: PROTOCOL_VERSION };
    const room: OnlineRoom =
      'roomId' in options
        ? await client.joinById(options.roomId, auth, OnlineState)
        : await client.create('race', { ...auth, settings: options.settings }, OnlineState);
    room.reconnection.minUptime = 0;
    room.reconnection.maxEnqueuedMessages = 0;
    return room;
  }
}

async function request(endpoint: string, path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${endpoint}${path}`, {
    ...init,
    signal: AbortSignal.timeout(10_000),
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(body);
    throw new Error(error.success ? error.data.error : `Server returned ${response.status}`);
  }
  return body;
}
