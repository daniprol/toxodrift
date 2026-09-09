# ToxoDrift

A browser-based TypeScript port of Death Rally's racing systems. Original assets and circuits first; Galician customization comes later.

**Playable, with partial original-engine parity.** Choose any of the 18 circuits or the Arena, drive one of six stock cars in 2-, 4- or 6-car races, or watch an AI race. Includes the original track imagery, projected scenery, car rotations, music and sound samples; acceleration, braking/reversing, drift, turbo, terrain, collisions, guns, mines, pickups, checkpoints, lap timing and results. See [port status](docs/port-status.md) for what is translated and what still differs.

## Run

Requires pnpm 10, 7-Zip (`7z`), and FFmpeg with libopenmpt. Project commands use Node 24: pnpm automatically downloads and selects the exact version pinned in `pnpm-workspace.yaml`, including for Git hooks. Your shell can keep its existing Node version.

If you use nvm, run `nvm install` and `nvm use` to select the same version for your shell. Keep `.nvmrc` and `useNodeVersion` in sync when upgrading Node.

```sh
pnpm install
pnpm assets:setup
pnpm dev
```

Open the URL printed by Vite. On this workspace the original assets have already been downloaded and imported. If updating an older checkout, run `pnpm assets:import` once to extract the menu and instrument artwork. `pnpm assets:setup` downloads the freeware installer, verifies both SHA-256 checksums, extracts it without executing it, decodes the racing assets in TypeScript, and converts tracker music with FFmpeg.

To use an existing installation:

```sh
pnpm assets:import /path/to/death-rally
pnpm assets:audio /path/to/death-rally
```

The directory should contain uppercase `MENU.BPA`, `IBFILES.BPA`, `ENGINE.BPA`, `MUSICS.BPA`, and `TR0.BPA` through `TR9.BPA`. Original files live in `.local/`; converted files live in `public/assets/original/`. Both are ignored by Git. Game assets remain Remedy's property and are not covered by the source-code license. A local build includes your imported assets; do not publish that build as a freely licensed asset bundle.

## Multiplayer

The opening menu offers **Single player** and **Multiplayer**. Connect to a saved/custom server or localhost, create or join a race, and mark ready. Choose 2, 4 or 6 total cars, a circuit, a shared car class and the number of AI. Each server maintains its own Elo leaderboard and configurable finish/AI progression points.

Multiplayer and the full test suite use the **pnpm-managed Node 24 runtime**. After asset setup:

```sh
pnpm dev:all          # Browser + Colyseus server
pnpm dev:server       # Server only
pnpm build:server     # Compile the server
pnpm start:server     # Run the compiled server
```

`pnpm dev` and `pnpm build` still run/build the browser game independently. Docker targets support client-only, server-only and combined hosting. Configure default server addresses in `public/config/multiplayer.jsonc` and server/ranking rules in `config/server.jsonc`. See [multiplayer setup and architecture](docs/multiplayer.md) and the [Colyseus research and design rationale](docs/multiplayer-research.md).

For the Colyseus network panel and live State viewer, run `pnpm dev:all:debug` (game + server) or `pnpm dev:debug` (game only), then create/join a multiplayer race. `VITE_NETWORK_DEBUG=1 pnpm dev` also enables it. Normal runs and production builds exclude the panel. See [network metrics and debug controls](docs/network-debug.md), including why the native jitter row is unavailable with our current input protocol.

## Controls

| Action                         | Keys               |
| ------------------------------ | ------------------ |
| Accelerate / brake and reverse | ↑ / ↓ or W / S     |
| Steer                          | ← / → or A / D     |
| Turbo                          | Shift              |
| Fire                           | Space or left Ctrl |
| Drop mine                      | X                  |
| Pause                          | Esc or P           |
| Recover to last checkpoint     | R                  |

The menu and race fill the viewport without scrolling. The menu uses the original 640×480 artwork, scaled proportionally; the race expands its camera view to fit wider screens. Choose **Full screen** to hide browser chrome where supported.

In the menu, ↑/↓ move between settings, ←/→ change values, and Enter/Space activate buttons. Circuit and car pickers also support arrow keys; Escape closes them. Mouse and touch work throughout.

On phones, race in landscape with the translucent joystick: drag up to accelerate, down to brake/reverse, and sideways to steer. Use the right-hand buttons for turbo, fire and mines; multiple fingers can hold controls together. Weapon buttons hide when weapons are disabled, and driving controls hide while paused or spectating. Turning to portrait pauses the race until you rotate back and resume. The race also pauses when the tab loses focus. Use **Sound on/off** to mute. **Watch a race** uses the same simulation and authored AI maps as opponents. **Solo practice**, with weapons disabled, is useful for learning the tracks.

## Configure

- [public/config/game.jsonc](public/config/game.jsonc): race defaults, vehicle parameters, simulation constants, combat, AI, viewport, colors, audio and keyboard bindings. Loaded and Zod-validated at startup; reload after editing.
- [config/tracks.jsonc](config/tracks.jsonc): original/alternate circuit names and archive IDs. Rerun asset import after changing it.
- [config/assets.jsonc](config/assets.jsonc): freeware download URL and pinned checksums.
- `public/config/schemas/game.schema.json`: editor completion generated from Zod with `pnpm schemas`.

Race setup lets you choose laps, total cars and weapons; solo practice remains available. Keyboard help updates from the configured bindings, and each car's `engineSample` chooses its sound independently of catalog order. Timing is expressed in original 70 Hz ticks: changing `tickRate` intentionally changes gameplay speed. Preserve 70 for the original feel.

## Develop and verify

```sh
pnpm hooks:install
pnpm check                  # format, lint, strict types, tests, client/server builds
pnpm exec playwright install chromium
pnpm test:e2e               # browser interactions and complete race
pnpm test:watch
```

Oxfmt formats; Oxlint lints. Lefthook checks formatting/lint/types on commit and tests on push. GitHub Actions checks the source separately from the downloaded-asset race/browser tests. Dependencies are locked in `pnpm-lock.yaml`.

Unit tests cover observable driving/combat behavior, checkpoint anti-shortcut rules, race transitions, configuration errors, binary decoding and frame-rate independence. Original-asset integration tests drive complete laps through every base circuit and check deterministic four-car alternate races. A further 114 combinations cover all six cars across all 19 circuits. These tests skip when assets are absent; `REQUIRE_ORIGINAL_ASSETS=1 pnpm test` makes their absence an error. Playwright tests drive using actual keyboard events and verify pause, restart, results, setup errors and a narrow viewport.

## Structure

```text
src/assets/          BPA/BPK/CMF/XM/track/scenery codecs and browser loading
src/config/schemas/  Runtime validation and inferred public configuration types
src/race/            Deterministic simulation; no browser or filesystem dependency
src/rendering/       Canvas track, car, projected scenery and original instrument renderers
src/platform/        Keyboard/touch input, viewport/fullscreen, fixed-step clock and browser audio
src/app/             Garage, session lifecycle, HUD, controls help and HTML view
src/network/         Shared protocol/schema, server preferences and snapshot rendering
server/              Independent Colyseus workspace; authoritative rooms and SQLite rankings
src/main.ts          Styles and application entrypoint
scripts/             Reproducible asset import and schema generation
config/              Asset-import and dedicated-server configuration
public/config/       Runtime configuration
tests/              Unit, original-asset integration and browser tests
```

Read [architecture](docs/architecture.md), [port status](docs/port-status.md), [handling and touch research](docs/controls-and-physics.md), and [third-party notices](THIRD_PARTY_NOTICES.md) before extending the engine.
