# ToxoDrift

A browser-based TypeScript port of Death Rally's racing systems. Original assets and circuits first; Galician customization comes later.

**Playable, with partial original-engine parity.** Choose any of the 18 circuits or the Arena, drive one of six stock cars against up to three opponents, or watch an AI race. Includes the original track imagery, projected scenery, car rotations, music and sound samples; acceleration, braking/reversing, drift, turbo, terrain, collisions, guns, mines, pickups, checkpoints, lap timing and results. See [port status](docs/port-status.md) for what is translated and what still differs.

## Run

Requires Node 20.19+ (Node 24 recommended), pnpm 10, 7-Zip (`7z`), and FFmpeg with libopenmpt.

```sh
pnpm install
pnpm assets:setup
pnpm dev
```

Open the URL printed by Vite. On this workspace the original assets have already been downloaded and imported. `pnpm assets:setup` downloads the freeware installer, verifies both SHA-256 checksums, extracts it without executing it, decodes the racing assets in TypeScript, and converts tracker music with FFmpeg.

To use an existing installation:

```sh
pnpm assets:import /path/to/death-rally
pnpm assets:audio /path/to/death-rally
```

The directory should contain uppercase `ENGINE.BPA`, `MUSICS.BPA`, and `TR0.BPA` through `TR9.BPA`. Original files live in `.local/`; converted files live in `public/assets/original/`. Both are ignored by Git. Game assets remain Remedy's property and are not covered by the source-code license. A local build includes your imported assets; do not publish that build as a freely licensed asset bundle.

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

The race also pauses when the tab loses focus. Use **Sound on/off** to mute. **Watch a race** uses the same simulation and authored AI maps as opponents. **Solo practice**, with weapons disabled, is useful for learning the tracks.

## Configure

- [public/config/game.jsonc](public/config/game.jsonc): race defaults, vehicle parameters, simulation constants, combat, AI, viewport, colors, audio and keyboard bindings. Loaded and Zod-validated at startup; reload after editing.
- [config/tracks.jsonc](config/tracks.jsonc): original/alternate circuit names and archive IDs. Rerun asset import after changing it.
- [config/assets.jsonc](config/assets.jsonc): freeware download URL and pinned checksums.
- `public/config/schemas/game.schema.json`: editor completion generated from Zod with `pnpm schemas`.

Race setup lets you choose laps, opponents and weapons. Keyboard help updates from the configured bindings, and each car's `engineSample` chooses its sound independently of catalog order. Timing is expressed in original 70 Hz ticks: changing `tickRate` intentionally changes gameplay speed. Preserve 70 for the original feel.

## Develop and verify

```sh
pnpm hooks:install
pnpm check                  # format, lint, strict types, tests, production build
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
src/rendering/       Canvas track, car and projected scenery renderers
src/platform/        Keyboard, fixed-step clock and browser audio
src/app/             Garage, session lifecycle, HUD, controls help and HTML view
src/main.ts          Styles and application entrypoint
scripts/             Reproducible asset import and schema generation
config/              Import-time configuration
public/config/       Runtime configuration
tests/              Unit, original-asset integration and browser tests
```

Read [architecture](docs/architecture.md), [port status](docs/port-status.md), and [third-party notices](THIRD_PARTY_NOTICES.md) before extending the engine.
