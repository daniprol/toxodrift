# Architecture

`Race` owns the race state and advances it exactly one tick at a time. Its inputs are a validated configuration, decoded track data and driver controls. There are no browser calls, fetches, timers or global random sources in the simulation. Running the same controls with the same track and config produces the same result.

The browser's `RaceSession` composes a `Race`, `Keyboard`, `FixedStepClock`, `RaceRenderer` and `RaceAudio`. The clock accumulates frame time and invokes fixed steps. Long stalls are capped; blur/visibility changes pause racing and clear held keys. Restart disposes the previous session, including its animation frame and browser subscriptions.

## Where to start reading

1. `src/main.ts` loads styles and starts the application. `src/app/application.ts` loads configuration and switches between the garage and a race session.
2. `src/app/garage.ts` owns editable race choices. It emits a `GarageSelection` snapshot before asset loading; setup controls stay disabled during loading. `RaceSetup` describes those choices without browser or asset dependencies.
3. `src/app/race-session.ts` owns one race's browser lifecycle. `race-hud.ts` updates telemetry and results. `view.html` holds the formatted markup; `control-bindings.ts` generates visible and accessible help from the active bindings.
4. `src/race/race.ts` shows the simulation's tick order. Its internal racer update delegates driving, movement and weapons to their domain modules. Renderers and audio only observe the resulting state.
5. `src/assets/track.ts` decodes track data and exposes map sampling and driving factors. `src/assets/formats.ts` holds dimensions shared by importers and renderers; format-specific record layouts stay beside their decoder.

## Ownership and contracts

`RaceState` is owned by the simulation. Renderers and audio observe it. Mutable racer records avoid allocation-heavy copying at 70 Hz; callers should treat exposed state as read-only outside scenario setup in tests. Separate modules handle drivetrain, terrain/collision response, opponent decisions, combat and progress. They share concrete typed data, without an ECS, event bus, dependency injection framework or generic plugin system.

| Boundary               | Contract                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| External config        | JSONC parser + strict Zod schemas; unknown keys and invalid ranges fail with file/field context                                |
| Original binary assets | Bounds-checked BPA directory, bounded BPK decoder, size-checked image planes, validated track metadata, bounded SCE/XM records |
| Simulation             | Plain objects, original coordinate system, one fixed tick per `step`                                                           |
| Controls               | An action object shared by keyboard and AI                                                                                     |
| Rendering/audio        | Observe race state; no authority over gameplay                                                                                 |
| Disk/browser           | Import scripts use Node; browser loaders use fetch and image decode                                                            |

Configuration types are inferred from Zod. Runtime state and small internal contracts use TypeScript interfaces alongside their domain modules. Do not duplicate runtime schemas as hand-written type definitions. Group configuration arguments in named option objects; keep small mathematical functions simple.

Use braces around control flow, blank lines between logical steps, and named operations to show processing order. Oxfmt preserves deliberate spacing and formats the HTML template; Oxlint enforces braces. Keep contracts beside their implementation unless they are shared domain types. Avoid introducing a framework or generic abstraction for a single use.

World positions are original image pixels. Directions are degrees: 0 north, 90 west, 180 south, 270 east. Car art has 96 orientations at 3.75° intervals. Track collision data uses one byte per world pixel; checkpoint and AI maps use one byte per 4×4 block. MAS low nibbles below 4 are walls. SCE mesh coordinates have eight fractional bits, while depth is a projection divisor (256 is ground level).

Runtime JSONC is fetched rather than compiled into JavaScript. Asset import configuration is consumed only by the import scripts. Binary-format dimensions, cipher parameters and offsets are format constants, not gameplay tuning options.

Each car owns its `engineSample` reference, so changing the car catalog order cannot change its sound. Import configuration schemas live in `src/config/schemas/imports.ts`. Music conversion writes a temporary file and publishes it only after FFmpeg succeeds; failed conversions leave no cache entry and can be retried.

Tests should drive the boundary a user or another component actually uses. The original-asset suite exercises decoding → authored AI → drivetrain → terrain → lap progression. The browser suite uses real controls and reads visible results; it has no window-level simulation cheats. Synthetic fixtures keep source-only tests independent of copyrighted data and download availability.
