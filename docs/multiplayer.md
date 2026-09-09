# Multiplayer operations and implementation

The browser game and the dedicated Colyseus server have separate entrypoints and builds. Single player runs entirely in the browser. Both runtimes import the same deterministic simulation from `src/race`; the server has no browser, rendering or audio dependency.

## Run and deploy

Use pnpm 10 and the existing imported assets (`pnpm assets:setup`). `pnpm-workspace.yaml` pins Node 24; pnpm downloads it on first use and selects it for project scripts and Git hooks, independently of your shell's Node version. Direct server execution outside pnpm requires Node 24+.

| Task                          | Command                            | Output                                                              |
| ----------------------------- | ---------------------------------- | ------------------------------------------------------------------- |
| Play/develop the browser game | `pnpm dev`                         | Vite on port 5173; single player needs no server                    |
| Run the multiplayer server    | `pnpm dev:server`                  | Colyseus on port 2567                                               |
| Develop both                  | `pnpm dev:all`                     | Both processes; Ctrl+C shuts them down                              |
| Build the static game         | `pnpm build`                       | `dist/`                                                             |
| Build the server              | `pnpm build:server`                | `server/dist/index.js`                                              |
| Run the compiled server       | `pnpm start:server`                | Requires production dependencies, configuration and simulation maps |
| Serve both from Node          | `SERVE_CLIENT=1 pnpm start:server` | Build both first; game and WebSocket share port 2567                |

Choose **Multiplayer**, select **Localhost**, and connect. The localhost shortcut appears when the game itself is on a loopback address; otherwise enter a server URL. A server URL is an HTTP(S) origin, such as `https://race.example.com`, with no path or query. WS(S) origins are normalized to HTTP(S). Saved servers and identities are isolated by canonical origin. There is deliberately no fictional public endpoint: add the future host in `public/config/multiplayer.jsonc`.

Create a race with 2, 4 or 6 cars and 0 to total-minus-one AI. The remaining slots are human reservations. Everyone loads the circuit and checks **Ready to race**; the host then starts. The selected car is a class restriction shared by all cars. Leave and create another race to change settings or run a rematch. Hosts transfer automatically in an unstarted lobby.

The server uses its own `public/config/game.jsonc` for physics, combat, AI, car classes and race deadlines, and sends the validated configuration to clients. Local control bindings, audio preferences and display settings remain local. Client/server manifests must match. Simulation binaries are size-checked on the server; the published content fingerprint is diagnostic, not a browser binary-integrity attestation.

### Containers

Run `pnpm assets:setup` before building images. Original assets retain their existing licensing restrictions; building a container does not grant redistribution rights.

```sh
# Server only, with a persistent SQLite volume:
docker compose up --build server

# Static game on :8080 plus server on :2567:
docker compose --profile client up --build

# Separate artifacts:
docker build --target client -t toxodrift-client .
docker build --target server -t toxodrift-server .

# One process serves both; permit the browser's actual origin:
docker build --target combined -t toxodrift .
docker run --rm -p 2567:2567 -v toxodrift-data:/data \
  -e ALLOWED_ORIGINS=http://localhost:2567 toxodrift
```

The server image contains only the manifest and terrain/checkpoint/AI binary maps, with no original images or audio. The client image is a static Nginx site. The combined target adds the browser build to the server image. Mount the entire database directory because SQLite uses WAL sidecars.

Set `trustedProxies` in `config/server.jsonc` to the IP addresses or CIDRs of proxies you operate (for example `["127.0.0.1/32"]` for a local proxy). The default empty list ignores forwarded client IP headers. A trusted proxy must replace or sanitize those headers. `httpRequestsPerMinute` limits API and matchmaking requests per client IP; static assets and health checks do not consume that allowance.

For an internet host, terminate HTTPS/WSS at a reverse proxy that forwards WebSocket upgrades, preserve the port/path, and set `ALLOWED_ORIGINS` to the exact game origins. An HTTPS game should connect to an HTTPS server. Do not use several replicas or PM2 cluster mode with this implementation: room listings and ownership are process-local. Scaling requires shared matchmaking/presence and a database designed for multiple processes, as discussed in [the research](multiplayer-research.md).

| Environment variable | Purpose                                                                         |
| -------------------- | ------------------------------------------------------------------------------- |
| `PORT`               | Listening port; overrides server JSONC                                          |
| `GAME_ROOT`          | Absolute repository/deployment root; defaults to `..` from the server workspace |
| `SERVER_CONFIG`      | Path to server JSONC; defaults to `$GAME_ROOT/config/server.jsonc`              |
| `DATABASE_PATH`      | SQLite file; defaults to `$GAME_ROOT/.local/server/rankings.sqlite`             |
| `ALLOWED_ORIGINS`    | Comma-separated exact browser origins; overrides JSONC origins                  |
| `SERVE_CLIENT=1`     | Serve `$GAME_ROOT/dist` alongside Colyseus                                      |

`GET /health` reports readiness after configuration and assets load. `GET /api/info` publishes the server name, protocol, race configuration, manifest and netcode rates. `/api/races` lists open lobbies and `/api/leaderboard` returns the top 100 drivers. `POST /api/players` creates a guest or authenticates the saved bearer credential. Keep backups of the SQLite database; a server restart preserves identities and rankings but aborts live races without rating penalties. Room simulation is not persisted or migrated.

## Code ownership

```text
src/app/                 mode menu, single-player garage, multiplayer browser/lobby
src/network/protocol.ts  validated requests, listings and results
src/network/server-client.ts  HTTP validation, guest identity and room connection
src/network/state.ts     Colyseus schema wire projection
src/network/remote-race.ts  buffered snapshot rendering and control transmission
src/network/servers.ts   public multiplayer settings and browser preferences
src/race/                shared deterministic world simulation (no IO)
server/src/race-room.ts   admission, human ownership, ready/start/drop/finish lifecycle
server/src/rankings.ts    finishing ties, configurable Elo and progression
server/src/store.ts       SQLite identities and atomic result settlement
server/src/assets.ts      headless loader for authoritative simulation maps
server/src/config.ts      server-only runtime validation and defaults
server/src/http.ts        HTTP endpoints, origin policy and per-client request limits
server/src/index.ts       transport and process composition
```

`protectHttp` wraps the bound Node request handler immediately after Colyseus starts listening. This ordering matters: Colyseus 0.18 dispatches matchmaking before its Express fallback, so Express route middleware alone cannot protect matchmaking. The HTTP tests use a real Colyseus server to cover this boundary.

The root remains the client package; `server/` is a pnpm workspace package with independent runtime dependencies. Esbuild bundles the shared game source into the server artifact, leaving runtime libraries external. Browser modules never import server code. Moving all existing sources into `apps/` and `packages/` would not improve the current import boundary; package extraction can follow if another consumer needs published modules.

## Authority and lifecycle

```mermaid
sequenceDiagram
  participant A as Browser A
  participant S as Colyseus race room
  participant B as Browser B
  participant D as SQLite
  A->>S: Create validated race settings + credential
  B->>S: Join room + credential
  S-->>A: Lobby state (host, slots, ready flags)
  S-->>B: Lobby state
  A->>S: Ready; host start request
  B->>S: Ready
  loop Fixed 70 Hz simulation
    A->>S: Sequenced controls
    B->>S: Sequenced controls
    S->>S: Human inputs + AI → physics/combat/progress
  end
  S-->>A: Schema deltas at configured patch rate
  S-->>B: Same authoritative world
  S->>D: Commit outcome + ratings + points atomically
  S-->>A: Persisted results state + result event
  S-->>B: Persisted results state + result event
```

Clients send booleans for throttle, brake, steering buttons, turbo, gun and mines; optional analog steering in [-1,1]; and a monotonically increasing sequence. They send no position, timestep, hit, finish or score. The server consumes the latest valid controls once per simulation tick, independently of message count. It ignores duplicate/out-of-order sequences, validates unknown fields and numeric bounds, limits payloads/messages, and substitutes neutral controls after the configured input timeout. Recovery is a rate-limited command for the sender's assigned car.

The room owns configuration, seat-to-identity-to-car mapping, AI, the full `Race`, checkpoints, cooldowns, damage, positions, laps, deadlines and results. Its schema exposes only observable cars, phase/tick/time, world items, lobby members/settings and persisted results. Credentials, track buffers and physics internals are private. `ready`, `start`, `recover` and `input` are requests; `notice` and `results` are server events. Tracers are short-lived cosmetic state, so some may be missed at low patch rates without changing weapon outcomes. Durable results also live in state for reconnecting clients.

Default physics is 70 Hz, input transmission is 35 Hz, and patches are 20 Hz. The browser buffers several snapshots and interpolates positions/degree headings with 75 ms default delay; recovery teleports snap. It does not predict or modify gameplay. There is no hitscan rewind in this implementation. WAN latency therefore affects steering responsiveness; prediction needs replay of coupled car physics, not just extrapolated positions. The research documents Colyseus 0.18's prediction/input/rewind options for that next step.

Online races never pause for one browser, finish when all cars resolve or the server deadline expires, and allow 30 seconds after the first finisher by default. Losing browser focus clears controls. Unexpected disconnection reserves the same seat for 20 seconds and uses neutral input; the SDK reconnects automatically. Expiry or a voluntary departure marks an unfinished car DNF. The driver's active reservation persists until results settle, preventing overlapping ranked races. Reload recovery across a destroyed browser page is not implemented; transient socket reconnect is. An idle lobby expires after ten minutes. During graceful server shutdown, unfinished races are aborted without settlement.

## Ranking configuration

`config/server.jsonc` owns the ranking rules. `pnpm schemas` generates game, multiplayer and server JSON schemas for editor support. Ranking data is local to each server, not global.

- **Elo** is normalized pairwise Elo against human rivals: `K / (humans - 1) × Σ(actual - expected)`, with `expected = 1 / (1 + 10^((rivalElo - ownElo) / scale))`. Defaults: initial 1000, K 32, scale 400. Same-rating duels give +16/−16. AI never changes Elo. All changes use the same rating snapshot inside one transaction; fractional ratings are retained.
- **Points** reward the configured finishing position plus each AI beaten. Defaults by position are 20/12/8/5/3/1 plus 2 per beaten AI, with a 0.5 multiplier for one-human races and a 200-point UTC daily cap. Only finishers receive progression; short races under 20 seconds award neither Elo nor points by default.
- Equal finish ticks or equal unfinished checkpoint/lap/health-status progress are ties for Elo. Starting slot is only a display tiebreaker. DNFs remain part of the human competitive outcome. Points cannot inflate the competitive rating; both numbers are shown in the leaderboard, ordered by Elo then points.

SQLite stores a unique race result and an audit snapshot of participants, rules and pre-settlement ratings. Settlement updates every driver and daily cap in one transaction, and retrying a race ID returns the existing award. If saving fails, the room retains the finished race and retries instead of publishing an uncommitted award. A process crash while storage is unavailable can still lose that pending result; the service does not claim durable in-progress simulation.

Guest credentials are cryptographically random and only hashes are stored on the server. Clearing browser storage loses guest access; account recovery, identity export/linking, stronger login, moderation and resistance to coordinated throwaway-account farming are not implemented. The configured points cap limits progression inflation but does not solve collusion. Before advertising a public ranked server, choose the account policy and measure concurrent race capacity and WAN behavior. No public hosting has been provisioned by this change.

## Network diagnostics

Use `pnpm dev:all:debug` to start both processes with the native Colyseus Room Debug Panel, or `pnpm dev:debug` for a browser connecting to an existing server. It loads when creating/joining a race, and production builds exclude it. See [the metric definitions and controls](network-debug.md).

## Validation

`pnpm check` covers formatting, lint, strict types, simulation/server tests and both builds. Tests use real Colyseus SDK/WebSocket clients for admission, readiness, host transfer, authoritative controls, reconnect and result persistence. SQLite tests verify credential survival, idempotency, ties, normalization and reward caps. Original-asset tests check safe six-car starts and simulation across every circuit. `pnpm test:e2e` starts an isolated server with an in-memory database and tests two independent browser identities alongside single-player, touch and viewport regressions.

The Docker targets need Docker to build/run. Passing browser and unit tests does not establish production capacity, high-latency play quality or container deployment correctness; those should be measured in the actual hosting environment.
