# Port status and evidence

This is a playable racing port, **not a completed or bit-exact port of the entire original game**. The priority is the race engine. The browser race setup reuses the original menu background, bitmap lettering and car portraits; the original campaign menus and economy have not been ported.

## References

The conversation in `chatgpt-thread.md` was read in full. Two local reference checkouts were inspected:

- [urxp/dRally](https://github.com/urxp/dRally), commit `920d85a7f3c3b95abb685bc26b5f6d67a2f4b982`, MIT. The principal implementation reference; translated logic is credited in `THIRD_PARTY_NOTICES.md`.
- [enriquesomolinos/DreeRally](https://github.com/enriquesomolinos/DreeRally), commit `bb0712748a658d00b0bb9672d78a61f367e53fde`. Read to cross-check domain names and asset layout. Its decompiled code was not copied into the repository.

The [DOS Games Archive freeware download page](https://www.dosgamesarchive.com/file/death-rally/deathrallywin_10) supplied the 2009 Windows installer. The exact URL and SHA-256 values are in `config/assets.jsonc`. Extraction uses 7-Zip; no installer or original executable is run. Downloaded license text remains at `.local/original/license.txt`.

## Port map

| System               | Reference in dRally                  | Current implementation                                                                                                                    |
| -------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Archive/cipher       | `bpa.c`, `bpk.c`, `drencryption.c`   | TypeScript BPA, bounded LZW + byte rotation, CMF decoder                                                                                  |
| Track metadata       | `race___49bd4h.c`                    | Dimensions, starts, checkpoint count, pickup positions                                                                                    |
| Track rendering data | `race___42824h.c`                    | IMA palette/image, MAS, VAI, LR1, DRV, SCE meshes/textures                                                                                |
| Alternate circuits   | `race___4af3ch.c`                    | 180° rotation of maps, starts, meshes/textures plus alternate palette                                                                     |
| Stock cars           | `race___3f970h.c`                    | Easy-difficulty stock engine, steering, tire-slip, dimensions and armor tables                                                            |
| Drivetrain           | `race___4c434h.c`                    | Original acceleration/drag/brake/turbo, steering memory, lateral slip and normalized movement equations                                   |
| Opponents            | `race___4b62ch.c`                    | Original 40-pixel, ±26° LR1 probes and per-zone target speed/steering; configurable corner-speed cap; simpler recovery and combat choices |
| Lap progress         | `race___55ae0h.c`                    | Ordered VAI zones sampled at front wheels; finish-line reset; lap timing; trailing cars finish on next crossing                           |
| Scenery              | `race___53310h.c`, `race___53464h.c` | Far-to-near object order, original projection, face winding, palette colors and attached texture blits                                    |
| Sound                | `sound_api.c`, XM samples, S3M music | Original effects/engines decoded in TS; soundtrack rendered by FFmpeg/libopenmpt; browser playback                                        |

## Known differences to resolve

- Collision response uses a sampled body and separating circles for car contacts. The original has sprite-level contacts, corner-specific steering impulses and more involved collision state. Contact now uses decaying relative-motion impulses and accumulated contact protection instead of braking the engine every overlapping frame. Current tests establish wall blocking and playability, not identical contact trajectories.
- Terrain drag is sampled at the center. The original uses multiple wheel probes and specialized spin/oil/ice/jump logic. Some surface effects remain approximations.
- Stock weapon damage coefficients, armor packages/driver bonuses, 70 Hz firing, ammunition use, start protection and mine drop timing now follow the original code; see [handling evidence](controls-and-physics.md). Bullet hit geometry, muzzle offsets/spread, mine activation/blast geometry and pickup selection remain approximations. Original random pickups, pedestrians, destructible props, rocket fuel, spikes and drug effects remain unported.
- AI corner speed is capped using steering rate × probe distance. This is a deliberate playability correction for the simplified collision/terrain model: without it, stock high-end cars run wide and can become trapped. All 114 stock-car/circuit combinations complete a four-car, weapons-off race in the regression matrix. AI recovery is simplified. Original overtaking, rubber-banding, random decisions, horns and difficulty tables need further porting. Only stock cars and one difficulty are currently offered.
- SCE tree lighting and shadow lookup tables are approximated. Alternate-car lighting uses normal sprites. The original instrument strip, damage previews, opponent damage bars, bitmap names/numbers and position badges are reproduced from `IBFILES.BPA`. Speed/turbo masking follows current simulation values; position transitions are immediate. Original palette animations, skid marks and smoke/explosion sprites are not yet reproduced.
- Engine playback loops the sample rather than emulating the original XM ping-pong loop and mixer. Music is rendered once and looped by the browser; tracker transitions and exact original mixer timing are not emulated.
- Calculations use JavaScript doubles rather than every original float32 rounding point. There is no recorded input/trajectory comparison against a running original executable yet.
- Recover-to-checkpoint and the race time limit are convenience rules in this port. Recovery never awards checkpoints.
- Campaign progression, garage upgrades, economy, saves, original menu flow, Adversary progression and the original multiplayer protocol remain out of scope of this racing implementation. ToxoDrift has a separate authoritative Colyseus multiplayer mode with 2/4/6-car races and server-local rankings; see [multiplayer](multiplayer.md).

## Verification

The tests verify asset-format failure handling, an independently calculated original acceleration trace, driving/braking/drift/turbo, wall and weapon blocking, ordered laps, pickups/mines, pause/resume and deterministic clock behavior. Original-asset integration tests complete real circuits using the same AI and simulation exposed in the browser. Playwright exercises setup, driving, weapons, pause, restart and a complete spectator race. These are meaningful behavior checks, but they do not substitute for frame-by-frame comparison with the original engine.

## Interface references

The menu and instrument layout were checked against the [original menu](https://dosdays.co.uk/media/games/drally/rally_000.png) and [race screenshot](https://dosdays.co.uk/media/games/drally/dr_bogota_012.png). Imported original art supplies the actual pixels; `fonts.c`, `race___42824h.c` and `race___40f48h.c` in the MIT dRally reference establish glyph advances, archive offsets and the 64×200 instrument layout. The compact quick-race setup and mobile controls are browser adaptations, not a port of campaign progression.
