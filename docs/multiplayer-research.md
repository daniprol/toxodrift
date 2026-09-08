# Multiplayer research and design

Reviewed 2026-09-08 against the official Colyseus documentation and npm registry. This note records research, recommended boundaries, and follow-up options; it is not a claim that every feature below is implemented. Deployment commands and implemented behavior belong in the README and architecture documentation.

## Decision

Run the existing deterministic racing simulation on a dedicated Colyseus server for online races. Keep single player entirely local. A race owns 2, 4, or 6 cars; a server owns many race rooms and its own persistent player records. Browser rendering, audio, menus, and input devices remain outside the simulation. This fits the existing `Race` boundary particularly well: it already advances fixed ticks without DOM, IO, timers, or global randomness.

Use an explicit server browser and race browser, with configurable server entries and user-added endpoints. Start with ordinary WebSockets, one server process, durable local storage, and human-only skill ratings alongside progression points earned from finishing and beating AI. These are project design decisions, informed by the framework and rating sources below.

## Version and API findings

The current registry versions at review were `colyseus@0.18.5`, `@colyseus/sdk@0.18.2`, and `@colyseus/schema@5.0.27`, checked with `npm view`. Use the committed lockfile as the reproducible version record. The official migration guide requires schema 5 for Colyseus 0.18 and identifies several traps: metadata updates replace rather than merge; `client.id` is removed in favor of `sessionId`; a schema has at most 63 fields; and `setTimestep()` replaces the old `setSimulationInterval()` name. [Colyseus 0.18 migration](https://docs.colyseus.io/migrating/0.18)

Current setup uses `defineServer`, `defineRoom`, and browser imports from `@colyseus/sdk`. Rooms supply server-owned state and lifecycle hooks. Avoid copying pre-0.17 examples without checking signatures. [Server configuration](https://docs.colyseus.io/server), [Client SDK](https://docs.colyseus.io/sdk)

## Framework options reviewed

| Capability              | What Colyseus provides                                                                                          | Application to ToxoDrift                                                                                                                                                                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rooms and lifecycle     | Creation, authentication, join, drop, reconnect, leave, disposal, shutdown hooks                                | One authoritative room per race, including its waiting grid and results. [Lifecycle](https://docs.colyseus.io/room/lifecycle)                                                                                                                                                               |
| Matchmaking and browser | Named rooms, metadata, filtering, seat reservations, live `LobbyRoom` listings                                  | Create explicitly and join by selected room ID. Keep the race browser subscribed to the lobby. [Lobby](https://docs.colyseus.io/matchmaker/lobby)                                                                                                                                           |
| Access control          | Separate `locked`, `private`, and `unlisted` flags                                                              | Lock racing rooms. A private room is discoverable by ID and is not automatically password protected. [Visibility](https://docs.colyseus.io/matchmaker/visibility)                                                                                                                           |
| Queued matchmaking      | `QueueRoom`, rank comparison, waiting-cycle escalation, team groups, incomplete groups for bots                 | Useful later for Quick Race; unnecessary for the requested manual browser. Read ratings from authenticated server records. [Queue](https://docs.colyseus.io/matchmaker/queue)                                                                                                               |
| Synchronization         | Typed schemas, collections, automatic binary delta patches                                                      | Send compact observable race state, not asset data or entire config on every tick. [Schema](https://docs.colyseus.io/state/schema)                                                                                                                                                          |
| Visibility filtering    | Per-client `StateView` membership and field tags                                                                | Six cars can share public state; keep tokens and account secrets outside schemas. Views can support private inventory or spectators later. [State views](https://docs.colyseus.io/state/view)                                                                                               |
| Large collections       | Experimental streaming additions with per-client priorities                                                     | Unnecessary for six-car tracks; avoid an experimental dependency without a measured need. [Streaming](https://docs.colyseus.io/state/streaming)                                                                                                                                             |
| Netcode                 | Input buffering, fixed timestep, prediction, reconciliation, interpolation, rewind                              | Preserve 70 Hz handling; use the new primitives where they fit the shared race simulation. [Netcode](https://docs.colyseus.io/netcode)                                                                                                                                                      |
| HTTP                    | Validated `createEndpoint`/`createRouter`, middleware, or Express integration                                   | Server capabilities, health, guest identity, paginated leaderboards. [HTTP routes](https://docs.colyseus.io/server/http-routes)                                                                                                                                                             |
| Authentication          | Anonymous, password, OAuth, configurable verification; auth module marked beta                                  | A stable guest identity is enough initially; retain a route to account linking. [Auth module](https://docs.colyseus.io/auth/module)                                                                                                                                                         |
| Persistence             | Optional `@colyseus/database`, Drizzle-based SQLite/PostgreSQL/PGlite, saves, configs, leaderboards, moderation | A separate persistence boundary is appropriate; the framework also permits a custom database. [Database](https://docs.colyseus.io/database)                                                                                                                                                 |
| Operations              | Playground, monitoring, production admin/RBAC, load and integration testing                                     | Keep development tooling private; expose safe health/capability routes. [Built-in tools](https://docs.colyseus.io/tools), [Admin](https://docs.colyseus.io/admin)                                                                                                                           |
| Room plugins            | Idle kick, unique sessions, user-session indexing, WebRTC signaling, optional GeoIP                             | Session limits can protect accounts; WebRTC signaling is not needed for authoritative driving. [Room plugins](https://docs.colyseus.io/room/plugins)                                                                                                                                        |
| Relay                   | Broadcasts client messages with minimal backend validation                                                      | Unsuitable as the race authority or source of leaderboard results. [Relay room](https://docs.colyseus.io/room/relay)                                                                                                                                                                        |
| Transports              | Default WebSocket, uWebSockets.js, Bun, experimental WebTransport                                               | WebSocket has the simplest browser/proxy deployment. WebTransport is the documented real unreliable channel, with deployment and compatibility tradeoffs. [WebSocket](https://docs.colyseus.io/server/transport/ws), [WebTransport](https://docs.colyseus.io/server/transport/webtransport) |
| Scale                   | Process-owned rooms, shared presence and matchmaking driver                                                     | Add shared services only when scaling beyond one process. A room is not split across workers. [Scaling](https://docs.colyseus.io/scalability)                                                                                                                                               |

This covers the relevant documented feature families. Payments, engine-specific adapters, and commercial example source do not contribute to this browser racing implementation.

## Menu and race lifecycle

Recommended navigation:

```text
Main menu
  Single player → Garage → Race → Results
  Multiplayer → Servers → Races / Leaderboard
                             Create race → Waiting grid → Race → Results
                             Join race   → Waiting grid → Race → Results
```

Reuse the existing 640×480 menu stage, imported lettering, button states, keyboard navigation, and modal picker. Online-specific views should remain ordinary menu panels with concise connection/status text and a working Back action. Every participant picks their own car; the creator additionally chooses track, laps, weapons, total cars, and AI count. An equal-car rule is a useful configurable ranked default because stock cars have unequal performance.

The server list merges deployment-configured entries with local user entries. An empty official list is valid until the free-hosted service exists. Store normalized HTTP(S) endpoints and labels, deduplicate them, and never invent an online public server. A localhost shortcut is meaningful when a server runs on the same device; on a phone it points at the phone, so use the host computer's LAN address instead. Public HTTPS deployments should advertise secure endpoints compatible with the browser's connection policy.

The capabilities response should advertise server ID/name, protocol version, config/content version, available circuits/cars, allowed race sizes, and relevant limits. Fail clearly on incompatible versions before joining. Treat labels and other server-provided strings as text, not HTML. Namespace locally stored guest credentials by normalized server origin so choosing another server cannot reuse the first server's credentials.

Separate `totalCars` from `humanSeats = totalCars - aiCount`. Require total cars in `{2,4,6}` and `0 ≤ aiCount < totalCars`. Bots occupy simulation slots, not Colyseus connections. The creator owns one human seat. The waiting grid must show human names, car selections, ready states, AI slots, and remaining human seats. Do not silently convert reserved human seats to bots: require explicit bot setup or an advertised configurable fill policy.

Use phases such as waiting → loading → countdown → racing → results. Freeze setup when loading begins, wait for human asset readiness with a timeout, and start the countdown from server time. A room can stay listed while locked, so show its phase and disable joining. `LobbyRoom` sends initial `rooms` plus `+` and `-` updates; register race rooms with `enableRealtimeListing()`. [Lobby API](https://docs.colyseus.io/matchmaker/lobby), [Visibility rules](https://docs.colyseus.io/matchmaker/visibility)

If the creator leaves while waiting, transfer control to a connected human or dispose the empty room. A creator has no authority over race results. Once racing, local pause opens a menu and clears local inputs while the server continues. All racers finishing, destruction, and the race deadline determine completion; racer zero finishing must not end an online race for everybody.

## Authority: inputs, state, events

| Direction                            | Data                                                                                                                           | Authority and validation                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Client → server, join                | Guest credential, display name, protocol/content compatibility, own car choice                                                 | Server validates identity, lengths, catalog IDs, room phase, and available seat. Never accept a claimed rating.                      |
| Client → server, waiting grid        | Ready/unready, own car change, creator's setup changes/start                                                                   | Validate phase and ownership each time. Setup changes clear readiness.                                                               |
| Client → server, driving             | Accelerate, brake, left/right or bounded analog steering, turbo, fire, mine                                                    | Only input intent. Server maps the authenticated connection to its car and validates finite ranges/rate.                             |
| Client → server, discrete commands   | Recover own car, leave                                                                                                         | Check phase, cooldown, and eligibility. A command never names another participant as the acting car.                                 |
| Server → client, durable live state  | Room phase/settings/roster; server tick; car position/direction, health/resources/progress; mines/pickups; finish status/order | Server owns simulation, collisions, combat, AI, checkpoint validation, timing, and placement.                                        |
| Server → client, presentation events | Shot/tracer, collision/destruction feedback, countdown cue, recovered car, actionable error                                    | Include tick and stable event identity if deduplication is needed. They support visuals/audio; they do not grant gameplay authority. |
| Server → client, final result        | Authoritative placements/status, elapsed/best lap, rating before/change/after, career gain                                     | Persist once, then publish. Keep recoverable results in state or queryable storage.                                                  |

Never accept client position, speed, damage, hit targets, checkpoint completion, finish time, bot decisions, or score submission as authoritative. State is what is true now; messages are occurrences or requests. An event that matters after a reconnect must have a corresponding state/result record. A short-lived tracer may begin and expire between patches, so it belongs in a bounded event stream or must remain visible long enough to reach a patch.

Keep internal simulation state separate from its wire projection: decoded collision/checkpoint/AI maps, car definitions, cooldown bookkeeping, last-safe positions, authentication, persistence handles, and anti-abuse counters are not automatically public. Prediction may require additional movement scalars, but this should be a deliberate contract.

Schema delta encoding rewards stable objects and fields. Update existing car schemas rather than replacing the full collection. Choose numeric representations deliberately and publish slower metadata only when it changes. Begin with a measured patch rate around 20 Hz and tune using bandwidth and visual results; physics must keep its existing 70 Hz behavior. [State optimization](https://docs.colyseus.io/state/optimization)

## Fixed stepping and latency

Colyseus 0.18 declares flat input schemas with `defineInput()`, supports sanitization and idle policies, and advertises a simulation rate via `setFixedTimestep()`. For a coupled car solver, consume one buffered command per human and advance the whole world once. Draining a burst and advancing the simulation per message allows client message volume to affect race speed. Draining but acknowledging commands that were never simulated breaks reconciliation. [Server input and timestep](https://docs.colyseus.io/netcode/server-input)

Recommended starting values are a 70 Hz simulation, bounded input history, 20 Hz snapshots, roughly 100 ms remote interpolation, a short stale-input timeout, and a 30-second reconnection window. These are tuning proposals, not Colyseus guarantees. Preserve the original movement rate before considering a lower wire rate with substeps. If batching inputs, replay each substep identically at both ends.

The browser's `room.input()` and `Predict` can provide local prediction plus smoothed remote entities. `predict.tick()` determines due steps; stage/send each input before reading rendered values. `reconciler` fits scalar entity state, while `predict.sim` supports composite or engine snapshots. Angle interpolation expects radians, whereas this game uses degrees: convert at the adapter or implement equivalent shortest-arc interpolation. [Client prediction](https://docs.colyseus.io/netcode/client-prediction)

ToxoDrift's contact impulses, steering memory, slip, cooldowns, and car-car interactions make position-only reconciliation insufficient. A prediction adapter must restore every value the replay step reads, including relevant coupled bodies. Treat other humans' future controls as unknown and let the server correct the outcome. Do not claim deterministic lockstep merely because the single-player core has deterministic ticks.

Prediction needs the same input values, timestep, config, and simulation logic on both sides. Rollback can replay a step many times, so audio/particles must not run directly inside the replaying simulation. Input rate, physics rate, and acknowledgement semantics must agree. [Determinism contract](https://docs.colyseus.io/netcode/determinism)

For the first playable path, authoritative snapshots plus interpolation are correct but add control latency; local prediction is the quality improvement to validate under realistic network delay. Combat remains authoritative throughout. Colyseus supports bounded historical rewind for hitscan using `allowRewindState()` and `rewind.lastSeenBy()`. Add it only alongside explicit weapon semantics and tests; rewinding the whole race for a mine/contact would change physical outcomes. [Lag compensation](https://docs.colyseus.io/netcode/lag-compensation)

## Disconnects and identity

In current Colyseus, unexpected loss goes through `onDrop()`, where the server calls `allowReconnection(client, seconds)`. The SDK retries automatically; success triggers `onReconnect()`, and permanent departure triggers `onLeave()`. Reconnection preserves the seat/session but rotates the reconnection token. Manual reconnection with a saved token supports page reloads. Reliable messages can buffer while disconnected, so stale throttle/fire commands must not be replayed as fresh gameplay. [Reconnection](https://docs.colyseus.io/room/reconnection)

Clear controls immediately on drop, blur, or visibility loss and stop queuing driving commands while disconnected. Keep the racer and race standings intact during the grace period. Neutral input, or an explicitly configured temporary AI takeover, is preferable to freezing an obstacle or continuing stale throttle. If AI takeover is enabled, record it and define reward eligibility. On permanent departure, apply the configured DNF policy without allowing quitting to erase an impending loss.

A display name and a browser-generated player ID are not authentication. Issue a high-entropy server credential tied to a durable identity, verify it on every connection, and retain it across server restarts. Anonymous accounts can later be linked to stronger login methods. Clearing browser storage loses a guest account unless recovery/export is implemented; the UI should explain that where the identity is managed.

The static `onAuth(token, options, context)` is the recommended token hook. Its successful result can bypass instance `onAuth`, so room-specific ownership/phase checks cannot depend solely on an instance hook. Validate claims server-side and perform room admission checks before assigning a racer. [Room authentication](https://docs.colyseus.io/auth/room)

## Ratings and rewards

Use two values per server: **Skill** for competitive strength and **Career points** for finishing and AI victories. A leaderboard can show both and provide either ordering. If the product needs one arcade total, label it as a combined score and retain the underlying skill value for future matchmaking. Adding an unlimited fixed bonus to Elo makes it increase with repeated play even when performance is unchanged; this is a mathematical consequence of the proposed update, not a research result.

Microsoft's TrueSkill work models strength and uncertainty, supports ranked multiplayer outcomes, and has been used in racing games. Its documented purpose is fair skill matching, and its FAQ explicitly discusses manipulation through arranged forfeits. Glicko-2 adds rating deviation and volatility; its author's specification uses rating periods and notes that larger numbers of games per period improve performance. These are useful alternatives when the player base justifies more modeling. [Microsoft TrueSkill](https://www.microsoft.com/en-us/research/project/trueskill-ranking-system/), [Glicko-2 specification](https://www.glicko.net/glicko/glicko2.pdf)

Start with transparent normalized pairwise Elo because it is easy to configure and explain. This multiplayer normalization is a project adaptation, not the TrueSkill algorithm:

```text
E(i,j) = 1 / (1 + 10 ^ ((rating[j] - rating[i]) / scale))
S(i,j) = 1 when i beats j, 0 when i loses, 0.5 for a genuine tie
delta[i] = K / (humanCount - 1) * sum_j(S(i,j) - E(i,j))
```

Compute all changes from the same pre-race ratings and exclude AI from this calculation. With fewer than two eligible humans, skill change is zero. Dividing by human opponents prevents six-human races multiplying the update simply through more pairings. With a common K and no clamps/rounding, changes sum to zero. Keep fractional ratings internally and round only for display; floors, per-player K, or rounding change that property. Suggested initial values are 1,000 starting skill, scale 400, K 32, all configurable. Equal 1,000-rated humans in a duel yield +16/−16.

Career gain should use configurable position tables for 2/4/6 cars plus a bonus for each AI beaten. Require a valid server-finished race and actual participation; do not reward all-AI spectators, aborted races, or a player who immediately disconnects. A one-human, five-AI race can earn career points while leaving skill unchanged. Persist the ruleset version alongside the award so changes remain explainable.

Bot and short-race farming require explicit economy choices: minimum eligible laps/time/progress, a maximum per-race award, bot-only reward scaling, and optional daily caps or diminishing repeat rewards. Start conservatively and tune from observed completion times rather than picking rewards solely by field size. Riot's published event-design rationale describes how per-game rewards encouraged shortest/easiest-mode farming and documents reduced AI progression rewards. That is a historical design precedent, not a claim about Riot's current reward rates. [Riot reward-design explanation](https://www.leagueoflegends.com/en-gb/news/dev/quick-gameplay-thoughts-12-3-event-mission-points/)

Resolve placement consistently: finishers first by authoritative finish order; unresolved racers by validated progress at the deadline; permanent quitters/DNFs according to an explicit policy. Truly tied results use the same competitive outcome, even if a stable ID is used for display ordering. Never use local visual interpolation positions to rank racers. Separate weapon/non-weapon or unequal-car rulesets into distinct rating pools if their observed skill relationships differ materially.

TrueSkill 2 explores richer evidence such as experience and quitting behavior, but this game's early implementation lacks the historical data needed to calibrate such a model. Keep immutable race outcomes so a more sophisticated algorithm can be evaluated later. [TrueSkill 2 research](https://www.microsoft.com/en-us/research/publication/trueskill-2-improved-bayesian-skill-rating-system/)

## Durable storage and configuration

Persistence should expose a small domain boundary: authenticate/create guest, fetch leaderboard/profile, and commit a completed race with all rating/reward changes. Use a unique race ID and transactional or equivalently serialized atomic writes so a retry cannot award twice and two simultaneous rooms cannot lose updates. Store participants, human/AI status, placements, finish/DNF data, before/after ratings, career awards, and ruleset/content versions. Publish a successful award only after persistence succeeds; keep a retryable result pending if storage fails.

SQLite with a mounted data directory is a good single-process deployment default; PostgreSQL fits multiple writers/replicas later. A deliberately single-process atomic-file store can also work for a small self-host, provided its limits and crash behavior are documented. Do not use ephemeral room state, local browser storage, or matchmaking presence as the leaderboard database.

`@colyseus/database` supplies optional persistence and built-in services. Its documented leaderboard submission keeps only a best score, so it is not the direct update mechanism for a skill rating that can decrease. Use custom tables/queries or another store for mutable ratings; built-in best-score leaderboards can serve track records. Its live config service supports schema validation and presence-based invalidation. [Database services](https://docs.colyseus.io/database/services)

Keep public client config separate from private server config. Public settings include default endpoints and menu/network presentation choices. Server config owns allowed content, total-car options, AI limits, readiness/reconnection/input timeouts, room/payload/rate limits, race deadline, rating parameters, position awards, bot bonuses, eligibility, retention, and storage location. Secrets belong in environment variables or mounted secret files. Validate configuration at startup with the existing strict Zod/JSONC conventions and freeze the relevant rules per race. Do not hot-change physics or scoring halfway through a running race.

## Repository and deployment shape

A workspace is useful when client, server, and shared code have independently buildable boundaries. Recommended logical ownership:

```text
browser application  → shared simulation + shared protocol
Colyseus application → shared simulation + shared protocol + server persistence
asset tools          → shared decoders/config schemas
```

The current repository can preserve `src/app`, `src/render`, `src/audio`, and the existing static asset paths while adding a dedicated server package and shared module boundary. A full `apps/client`, `apps/server`, `packages/game`, `packages/protocol` layout is also sound, but mass-moving established assets/tests is not necessary merely to gain independent entrypoints. What matters is enforcing imports: shared simulation must never import the SDK, DOM, renderer, filesystem, or server secrets; browser code must never import the server runtime.

If packages are extracted, use a root `pnpm-workspace.yaml`, a shared lockfile, and `workspace:*` dependencies. pnpm's workspace protocol guarantees that those dependencies resolve locally rather than silently falling back to the registry. Keep development commands at the root so the common use case remains simple. [pnpm 10 workspaces](https://pnpm.io/10.x/workspaces)

| User goal               | Deliverable                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Run the game directly   | Existing Vite development command and static client build; single player never requires a server.                                    |
| Deploy only multiplayer | Compiled Node entrypoint, server production dependencies, physics/config/track-data assets, persistent data volume.                  |
| Run both locally        | One root orchestration command starting browser development and the server with clean shutdown of both.                              |
| Deploy both             | Client static artifact plus server artifact; optionally let the Node server serve the built client for a simple same-origin install. |

Production servers should run compiled JavaScript with `NODE_ENV=production`, expose a configurable port, and sit behind TLS/WebSocket-capable ingress. The Colyseus deployment guide explicitly discourages `tsx`/`ts-node` as production runtime and PM2 cluster mode. A container restart policy or suitable process manager handles crashes. [Colyseus deployment](https://docs.colyseus.io/deployment)

Build server images separately from client static images; a server-only image does not need Vite, browser graphics/audio, or the browser test runner at runtime. It does need the track maps and metadata used by physics/AI. Copy or mount those assets deliberately; never depend on a developer's working directory. Preserve the repository's existing original-asset distribution policy.

pnpm documents production-only deployment of workspace packages into a portable directory, including workspace dependencies. Check its injected-workspace requirement or legacy mode against the pinned pnpm 10 version; do not copy commands from the site's newer default version blindly. Multi-stage images keep build dependencies out of the runtime. [pnpm 10 deploy](https://pnpm.io/10.x/cli/deploy), [pnpm 10 Docker](https://pnpm.io/10.x/docker)

Start with one process. Multiple processes need shared presence, a shared matchmaking driver, and routing to the process that owns each room; the documented Redis setup supplies these coordination services. It does not replicate an in-progress physics simulation. Persistent player data needs its own multi-process-safe store. Benchmark rooms per process before setting a capacity number. [Colyseus scaling](https://docs.colyseus.io/scalability)

Graceful shutdown removes a process from matchmaking and locks rooms. The default room shutdown disconnects clients; override it to drain running races within a bounded deadline or mark them aborted without skill penalties. Await pending writes. Hosting a server on a service that sleeps or terminates active sockets affects continuity, so the future public endpoint should only be advertised after those behaviors are tested. [Graceful shutdown](https://docs.colyseus.io/server/graceful-shutdown)

## Changes required by the existing engine

At the start of this work, `Race` assumed a single human at index zero, at most three opponents, four opponent names, and a race-ending condition tied to the first racer. `recoverPlayer`, human steering treatment, and armor also depended on the zero index. All of these assumptions must become explicit per-racer/controller policies for multiplayer; changing only the array length would leave unfair or broken behavior.

For six cars, generate or author two additional grid positions and validate that every position lies on driveable terrain, respects the car collision radius, and does not overlap another start. Preserve the first four authored starts. Run these checks over every track and reverse/alternate variant. Renderers, standings, instruments, result tables, colors, collision loops, names, and accessible labels must handle the selected field size and local racer identity.

Keep the single-player convenience API if useful, with a deeper per-racer input entrypoint for server use. Shared race code should produce finish/progress data independent of the local observer. Online opponents use the same AI as local races on the server, so clients cannot alter bot difficulty, route choices, or awards.

## Validation that demonstrates the behavior

Use the existing simulation tests for 2/4/6 cars, valid starts, independent human inputs, own-car recovery, and finishing rules. Add meaningful rating cases: equal and unequal opponents, full-field normalization, AI-only competition, ties/DNF, duplicate finalization, concurrent rooms, and restart persistence.

Colyseus's testing package runs real SDK connections and supports waiting for messages, patches, and timesteps; it works with Vitest. Exercise room admission/capacity, readiness, owner transfer, invalid inputs, authoritative movement/combat, disconnect/rejoin, timeout, and locked-room behavior through that boundary. [Colyseus testing](https://docs.colyseus.io/tools/unit-testing)

Browser tests should open independent contexts, select the server, create/join a race, drive different cars, and observe the same authoritative result. Check that single player works while the server is absent. Test latency/jitter and reconnect behavior separately from a fast localhost happy path. Use `@colyseus/loadtest` with actual racing inputs to measure simulation time, bandwidth, event-loop delay, heap growth, and supported room count. No production capacity claim is justified by unit tests alone. [Load testing](https://docs.colyseus.io/tools/loadtest)
