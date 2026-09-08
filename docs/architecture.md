# Architecture

`Race` owns the race state and advances it exactly one tick at a time. Its inputs are a validated configuration, decoded track data and driver controls. There are no browser calls, fetches, timers or global random sources in the simulation. Running the same controls with the same track and config produces the same result.

The browser's `RaceSession` composes a `Race`, `Keyboard`, `TouchControls`, `FixedStepClock`, `RaceRenderer`, `InstrumentRenderer` and `RaceAudio`. The clock accumulates frame time and invokes fixed steps. Long stalls are capped; blur/visibility changes pause racing and clear held keys. Restart disposes the previous session, including its animation frame and browser subscriptions.

## Where to start reading

1. `src/main.ts` loads styles and starts the application. `src/app/application.ts` loads configuration and switches between mode selection, the garage, multiplayer and a race session.
2. `src/app/garage.ts` owns editable race choices. It emits a `GarageSelection` snapshot before asset loading; setup controls stay disabled during loading. `RaceSetup` describes those choices without browser or asset dependencies.
3. `src/app/race-session.ts` owns one race's browser lifecycle. `race-hud.ts` updates accessible telemetry and results. `InstrumentRenderer` draws the original 64×200 instrument art from live race state, with separate player, standings and presentation steps. `view.html` holds the formatted markup; `control-bindings.ts` generates pause-screen and accessible help from the active bindings. `menu-navigation.ts` owns arrow-key navigation; `menu-font.ts` displays the original bitmap lettering.
4. `src/race/race.ts` shows the simulation's tick order. Its internal racer update delegates driving, movement and weapons to their domain modules. Renderers and audio only observe the resulting state.
5. `src/assets/track.ts` decodes track data and exposes map sampling and driving factors. `src/assets/formats.ts` holds dimensions shared by importers and renderers; format-specific record layouts stay beside their decoder.

## Ownership and contracts

`RaceState` is owned by the simulation. Renderers and audio observe it. Mutable racer records avoid allocation-heavy copying at 70 Hz; callers should treat exposed state as read-only outside scenario setup in tests. Separate modules handle drivetrain, terrain/collision response, opponent decisions, combat and progress. `damage.ts` owns armor and fixed-point health conversion; each racer stores effective armor, frame displacement and decaying contact impulses independently of the shared stock-car configuration. They share concrete typed data, without an ECS, event bus, dependency injection framework or generic plugin system.

| Boundary               | Contract                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| External config        | JSONC parser + strict Zod schemas; unknown keys and invalid ranges fail with file/field context                                |
| Original binary assets | Bounds-checked BPA directory, bounded BPK decoder, size-checked image planes, validated track metadata, bounded SCE/XM records |
| Simulation             | Plain objects, original coordinate system, one fixed tick per `step`                                                           |
| Controls               | Boolean actions plus optional analog steering, shared by keyboard, touch and AI                                                |
| Rendering/audio        | Observe race state; no authority over gameplay                                                                                 |
| Disk/browser           | Import scripts use Node; browser loaders use fetch and image decode                                                            |

Configuration types are inferred from Zod. Runtime state and small internal contracts use TypeScript interfaces alongside their domain modules. Do not duplicate runtime schemas as hand-written type definitions. Group configuration arguments in named option objects; keep small mathematical functions simple.

Use braces around control flow, blank lines between logical steps, and named operations to show processing order. Oxfmt preserves deliberate spacing and formats the HTML template; Oxlint enforces braces. Keep contracts beside their implementation unless they are shared domain types. Avoid introducing a framework or generic abstraction for a single use.

World positions are original image pixels. Directions are degrees: 0 north, 90 west, 180 south, 270 east. Car art has 96 orientations at 3.75° intervals. Track collision data uses one byte per world pixel; checkpoint and AI maps use one byte per 4×4 block. MAS low nibbles below 4 are walls. SCE mesh coordinates have eight fractional bits, while depth is a projection divisor (256 is ground level).

Runtime JSONC is fetched rather than compiled into JavaScript. Asset import configuration is consumed only by the import scripts. Binary-format dimensions, cipher parameters and offsets are format constants, not gameplay tuning options.

Each car owns its `engineSample` reference, so changing the car catalog order cannot change its sound. Import configuration schemas live in `src/config/schemas/imports.ts`. Music conversion writes a temporary file and publishes it only after FFmpeg succeeds; failed conversions leave no cache entry and can be retried.

Tests should drive the boundary a user or another component actually uses. The original-asset suite exercises decoding → authored AI → drivetrain → terrain → lap progression. The browser suite uses real controls and reads visible results; it has no window-level simulation cheats. Synthetic fixtures keep source-only tests independent of copyrighted data and download availability.

## Display and input

The menu is a proportionally scaled 640×480 stage using imported `MENU.BPA` artwork. Its native modal picker scales independently because dialogs render in the browser top layer. `src/styles/menu.css` and `src/styles/race.css` own the two layouts; shared rules stay in `src/style.css`.

The race instrument canvas stays 64×200 and fills viewport height. A `ResizeObserver` adjusts the track canvas width at the configured logical height, so landscape screens reveal more track without stretching sprites. The observer belongs to `RaceRenderer` and disconnects when the session is disposed.

`TouchControls` owns a floating `Joystick` and tracks action-button pointers by ID. Pointer capture handles release outside the activation area. `Joystick` owns its dead zone, axis normalization and thumb feedback, exposing throttle/brake and optional analog steering through `DriverInput`. `DRIVING_BUTTONS` lists the shared boolean actions; analog steering is composed separately. The session combines touch and configured keyboard actions before each simulation tick. Pause, blur, portrait rotation and disposal clear held input. Browser fullscreen and orientation lock are optional enhancements; CSS viewport fitting works without them.

`scripts/lib/import-interface.ts` checks the menu palette, explicit image dimensions and required instrument plane sizes before exporting each asset during normal import. `src/assets/interface.ts` documents instrument sizes and car sprite mappings. Instrument colors come from the active track palette, with car paint ramps matched to race colors. Original graphic files remain ignored by Git.

## Multiplayer extension

`server/` is a separate pnpm workspace with a headless Colyseus runtime. Both applications import the shared `src/race` simulation. Explicit driver slots and input maps allow multiple humans; online races wait for all racers or the server deadline. `src/network` owns the public protocol and observable schema. `RaceSession` uses either a local simulation clock or a `RemoteRace` snapshot observer. The server owns all online gameplay and persistent rankings. See [multiplayer architecture and operations](multiplayer.md) for the lifecycle, configuration, wire contract and deployment modes.

Race setup offers 2/4/6 cars and solo practice. The authored four starts remain unchanged; additional starts are validated on drivable terrain behind the grid. The original instrument layout is preserved through four racers and switches to compact six-row standings for six racers.

For online work, read `src/app/multiplayer.ts` for menu/lobby transitions, then `src/network/server-client.ts` for server connection and identity handling. Follow `server/src/race-room.ts` for the authoritative lifecycle. HTTP policy lives in `server/src/http.ts`; ranking rules live in `server/src/rankings.ts`, with persistence in `server/src/store.ts`. `server/src/index.ts` only assembles the process. Change gameplay in the shared simulation, not in either network adapter.
