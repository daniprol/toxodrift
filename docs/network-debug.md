# Multiplayer network debug panel

Reviewed 2026-09-09 against the official documentation and the installed `@colyseus/sdk@0.18.2` source. Recheck these details when upgrading the SDK; the upstream source links below track its current branch.

The screenshot's right-hand widget is Colyseus's **Room Debug Panel**, available through `@colyseus/sdk/debug`. We use that component directly, including its styling, graphs, state viewer and connection controls. It is a browser development overlay, separate from the server's monitoring/admin tools. [Official SDK documentation](https://docs.colyseus.io/getting-started/typescript#room-debug-panel)

## Enable it

- `pnpm dev:debug`: run the browser with network debugging enabled; connect to a separately running server.
- `pnpm dev:all:debug`: run the browser and local multiplayer server together with network debugging enabled.
- `VITE_NETWORK_DEBUG=1 pnpm dev`: enable it through the browser's environment instead.

Enter multiplayer and create or join a race to load the panel. Ordinary development runs leave it disabled. Production builds exclude it, including when the flag is set. In debug mode the race action buttons move to the left, leaving the panel its default top-right corner. The integration loads the SDK's optional module at the room-entry boundary; gameplay, simulation and rendering do not depend on the overlay.

## Read the metrics

Each panel describes **one browser's connection to one room**, rather than the whole server. Orange is outgoing traffic; blue is incoming traffic. The rates count messages observed by the SDK's connection hooks after attachment, so initial matchmaking and earlier handshake traffic are absent. Outbound binary messages use their byte-array length; inbound binary messages use their buffer byte length. This includes Colyseus protocol bytes, state patches and ping replies, but excludes HTTP traffic and WebSocket/TCP/IP/TLS framing. These are application payload rates, not total billed bandwidth. [Instrumentation source](https://github.com/colyseus/colyseus/blob/master/packages/sdk/src/debug.ts)

| Display                     | Calculation and interpretation                                                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orange/blue `B/s` or `KB/s` | Bytes observed since the previous refresh divided by actual elapsed seconds. The refresh timer runs every second; it is not a continuously sliding one-second window.      |
| `messages` below each rate  | Message count over the same interval divided by elapsed seconds, rounded to a whole number. Despite the short label, this is messages **per second**, not a session total. |
| Sparklines                  | Up to 60 refresh samples, approximately one minute. Each graph scales independently between its own minimum and maximum; compare the numbers to compare traffic volumes.   |

[Rate calculation and graph source](https://github.com/colyseus/colyseus/blob/master/packages/sdk/src/debug/panel.ts). The formatter divides by 1024 while labeling units `KB`, `MB`, etc. [Byte-formatting source](https://github.com/colyseus/colyseus/blob/master/packages/sdk/src/debug/core.ts)

The header's milliseconds are the latest **round-trip ping**, rounded to a whole millisecond: elapsed browser time between sending a Colyseus ping and receiving its reply. They are neither one-way latency nor the delay from input to a rendered frame. The overlay probes immediately and every two seconds. Subsequent probes add one payload byte in each direction to the measured traffic; the initial probe is sent before the outgoing hook attaches. [Ping implementation](https://github.com/colyseus/colyseus/blob/master/packages/sdk/src/Room.ts), [Probe scheduling](https://github.com/colyseus/colyseus/blob/master/packages/sdk/src/debug.ts)

## Why the screenshot has a jitter row

The SDK displays the purple row only when the room clock knows the server's patch cadence. Colyseus supplies that through its declared-input/TIMED protocol. Our race rooms currently use ordinary `input` messages, so the SDK clock has no such samples and the **jitter row is absent**. Ping and traffic measurement still work. We retain the game's input protocol rather than change it solely for a diagnostic display. The screenshot's separate prediction panel also requires Colyseus prediction handles; our renderer currently interpolates authoritative snapshots. [Room clock contract](https://github.com/colyseus/colyseus/blob/master/packages/sdk/src/Room.ts), [Panel visibility condition](https://github.com/colyseus/colyseus/blob/master/packages/sdk/src/debug/panel.ts)

For a compatible TIMED room, the SDK calculates an interarrival jitter estimate. Given arrival gap `g`, advertised patch interval `P`, and `m = round(g / P)`, it updates `J = J + (abs(g - m * P) - J) / 16` when `1 <= m <= 4`. Other gaps are skipped; no estimate is possible before the cadence and two arrivals are known. Rounding accounts for idle gaps that span whole patch intervals, while skipping bursts and long stalls. This is an exponentially smoothed cadence deviation, not ping variance, standard deviation or packet loss; the displayed `±` is descriptive. The graph samples that estimate each second. [Clock implementation](https://github.com/colyseus/colyseus/blob/master/packages/sdk/src/RoomClock.ts)

## State and connection controls

**State** opens an expandable, live view of the room state already decoded in this browser. It does not fetch another snapshot or expose private server objects. Primitive changes update existing values; structural changes trigger a full tree render throttled to 200 ms. Hidden tabs defer rendering until visible again. Closing the viewer restores the decoder callback and disposes its listeners. [State viewer](https://github.com/colyseus/colyseus/blob/master/packages/sdk/src/debug/state-inspector.ts), [Tree updates](https://github.com/colyseus/colyseus/blob/master/packages/sdk/src/debug/state-tree.ts)

**Drop** closes the connection using Colyseus's reconnectable close code, exercising the game's normal reconnection path. The logo menu also offers latency and jitter simulation. Simulated delay values are round-trip values, split between incoming and outgoing messages; jitter preserves message order. These controls really delay traffic and their preferences survive reloads in local storage. Set both to zero, or run `__net()` in the browser console, to clear simulation. [Drop action](https://github.com/colyseus/colyseus/blob/master/packages/sdk/src/debug/panel.ts), [Simulator implementation](https://github.com/colyseus/colyseus/blob/master/packages/sdk/src/debug.ts)

Leaving a room removes its panel and ping timer. An open State viewer can retain the last state with a disconnected status until closed. Once loaded, the SDK's logo/menu remain available for the page's lifetime. Its UI uses a shadow root to isolate its styles from the game. [Panel cleanup](https://github.com/colyseus/colyseus/blob/master/packages/sdk/src/debug.ts), [Overlay root](https://github.com/colyseus/colyseus/blob/master/packages/sdk/src/debug/core.ts)

## WebSockets and HTTP in this game

Race inputs, readiness/start messages, state patches, results and reconnection use **WebSockets**. The server explicitly installs `WebSocketTransport` in [server/src/index.ts](../server/src/index.ts). HTTP handles server information, guest identity, race listings and leaderboards in [src/network/server-client.ts](../src/network/server-client.ts), plus Colyseus's initial matchmaking/seat reservation. An `http://` server address therefore does not mean races use HTTP polling; the SDK opens the room's WebSocket afterward. Use HTTPS/WSS for a publicly deployed secure server. [Client SDK documentation](https://docs.colyseus.io/getting-started/typescript)

## Verify the integration

`VITE_NETWORK_DEBUG=1 pnpm exec playwright test tests/e2e/network-debug.spec.ts` checks the native panel, measured traffic, live State viewer and removal on leave against a real local server. Ordinary multiplayer browser tests verify the overlay stays absent with debugging disabled. `pnpm build` removes the optional debug import even if the flag or Vite mode enables it during development.
