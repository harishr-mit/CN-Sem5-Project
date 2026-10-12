# NoBu Network Emulator

A standalone network-impairment proxy for **any** WebSocket or UDP application. Put it between a client and a server, and it delays, drops, duplicates, reorders and rate-limits their traffic, packet by packet, while you watch and change everything live on its dashboard.

NoBu Shooter is just one client of it. The emulator imports nothing from the game; its only dependency is `ws`.

```text
client ──► emulator route (listen port) ──► target (your server)
              │  one session per client, with its own
              │  up link (client → target) and down link (target → client)
              │  loss · duplication · bandwidth + queue · latency + jitter · reordering
              └─ dashboard + control API on http://127.0.0.1:9001 (never impaired)
```

## Start it

From the repository root (or `NoBu-Shooter/`):

```bash
npm run emulator
```

This starts the dashboard and nothing else. Open **http://127.0.0.1:9001/**, then add a **route** under *Routes*:

- **Protocol:** UDP or WebSocket.
- **Listen port:** the port your client will talk to.
- **Target:** where the traffic goes (`host:port` for UDP, `ws://host:port` for WebSocket).

The emulator starts listening at once, and every client that connects gets its own session.

Routes can also be given on the command line (repeatable):

```bash
npm run emulator -- --route udp:9100=127.0.0.1:7000 --route ws:9200=ws://127.0.0.1:8080
```

`npm run demo` starts it with the game's two routes: `ws:9000 → ws://127.0.0.1:8080` and `udp:9100 → 127.0.0.1:8081`.

In front of the **game edition** (`npm start`, Phase 7), add a route yourself: `npm run emulator -- --route ws:9000=ws://127.0.0.1:8080`, and give players `http://<host>:8080/?server=<host>:9000` — the page still comes from the game server, the game connection goes through the emulator, and the dashboard impairs every player. Behind the emulator every player reaches the server from 127.0.0.1, which is why the game server never treats "localhost" as the operator.

## Try it without the game (three terminals)

```bash
# 1. a UDP app: prints each datagram and echoes it back
npm run udp-echo -- --port 7000

# 2. the emulator; then on the dashboard add: UDP, listen 9100, target 127.0.0.1:7000
npm run emulator

# 3. a UDP client: sends "#1 hello", "#2 hello", … through the emulator and waits for the echoes
npm run udp-send -- --to 9100 --rate 5
```

Every message comes back. Now, on the dashboard, select the route, choose **UP ↑** and set **Loss** to 20 %:

- `udp-send` starts printing `✗ #17 never came back`;
- the packet log shows the `lost` packets;
- the live chart shows the loss.

With **BOTH** directions at 20 %, a round trip survives only 0.8 × 0.8 = 64 % of the time. Try **Latency**, **Jitter** and **Reorder** too: the round-trip times change and the numbers come back out of order.

Stop `udp-send` with Ctrl+C to see a summary: sent, back, lost %, and the average round trip.

### With other tools

- **WebSocket:** start your WS server, add a route such as `ws:9200 → ws://127.0.0.1:8080`, and connect your client to `ws://127.0.0.1:9200`. For a quick manual test, `npx wscat -c ws://127.0.0.1:9200` works (`npx` keeps it in the npm cache; nothing is installed globally). Add `?label=alice` to the URL to name the session.
- **UDP with netcat / socat** (Linux / macOS, if you have them): `socat -v UDP-LISTEN:7000,fork EXEC:cat` as the echo, and `nc -u 127.0.0.1 9100` as the client.

## Routes and sessions

| | WebSocket route | UDP route |
|---|---|---|
| Session | one per client connection | one per client source address `ip:port` (NAT-like) |
| To the target | its own upstream WS connection; path and query are passed on | its own upstream UDP socket (ephemeral port), so the target sees one peer per client |
| Packet | one frame (text stays text, binary stays binary) | one datagram, forwarded byte for byte |
| Ends | when either side closes | after 30 s without traffic (`--udp-idle-ms`) |
| Name | `?label=` in the URL | `udp <ip:port>`; rename with the control API (`session.label`) |

- **Limits:** at most 64 sessions per route (`--max-sessions`); further clients are refused and counted.
- **Accounting:** sizes count the payload + 28 bytes (a UDP/IP header), for WebSocket frames too. The bandwidth cap and the charts therefore read like a UDP link.
- **Fragments are not reassembled:** if an app splits its messages, the emulator impairs every datagram on its own. One lost fragment then loses the whole message; the game's network players show exactly this effect.
- **No TCP mode:** impairing a byte stream isn't meaningful, and TCP's retransmission would hide the loss. Over WebSocket, each frame is treated as a datagram.

## What a link does to each packet

In order: **loss** (random or Gilbert-Elliott bursts) → **duplication** → **bandwidth cap** with a FIFO queue (packets that would wait longer than the queue limit are dropped) → **latency + jitter** → **reordering** (a reordered packet is held back so later ones overtake it). Without reordering, packets leave in order even with jitter, unless *Jitter may reorder* is on.

| Field | Default | Meaning |
|---|---|---|
| `latencyMs` | 0 | one-way delay |
| `jitterMs`, `jitterDist` | 0, `normal` | random extra delay (σ for normal, ± range for uniform) |
| `lossPct`, `lossModel`, `burstLen` | 0, `random`, 4 | packet loss; `burst` drops runs of about `burstLen` packets |
| `duplicatePct` | 0 | extra copies |
| `reorderPct`, `reorderDelayMs` | 0, 80 | packets held back by `reorderDelayMs` |
| `bandwidthKbps`, `queueLimitMs` | 0 (unlimited), 400 | rate cap and the longest queue wait before a tail drop |
| `allowJitterReorder` | false | let jitter alone reorder packets |

**Presets:** Baseline, Café Wi-Fi, Mobile 4G, Transatlantic, Nightmare (120 ms ± 50, 12 % burst loss, 3 % duplicates, 5 % reordering, 400 kbps).

**Targets:** a change applies to:
- **all routes**, which also covers routes added later;
- **one route**, which also covers sessions that join it later;
- or **one session**.

It can be set for **both** directions, or for **up** (client → target) or **down** (target → client) only.

## Command line

```text
--route <proto>:[host:]<port>=<target>   repeatable, e.g.
      ws:9000=ws://127.0.0.1:8080           WebSocket, all interfaces
      udp:9100=127.0.0.1:8081               UDP, all interfaces
      udp:127.0.0.1:9100=127.0.0.1:8081     UDP, this machine only
--listen <port> --target <ws-url>        older form: one WebSocket route
--control <port>        dashboard + control API (default 9001)
--control-host <ip>     default 127.0.0.1 (see Safety)
--allow-origin <url>    another browser origin allowed to use the control API
--udp-idle-ms <ms>      default 30000
--max-sessions <n>      per route, default 64
--seed <n>              impairment RNG seed (default 1): the same seed gives the same decisions
```

## Control API (for scripts)

The dashboard only uses this API, so anything it does can be scripted. Connect a WebSocket to `ws://127.0.0.1:9001` and send JSON commands:

```js
// node -e "…" (ws is a dependency of this repo)
const ws = new (require('ws'))('ws://127.0.0.1:9001');
ws.on('open', () => {
  ws.send(JSON.stringify({ cmd: 'route.add', proto: 'udp', port: 9100, target: '127.0.0.1:7000' }));
  ws.send(JSON.stringify({ cmd: 'preset', target: 'udp:9100', name: 'Nightmare' }));
  ws.send(JSON.stringify({ cmd: 'set', target: 'udp:9100', direction: 'up', patch: { lossPct: 20 } }));
});
ws.on('message', (m) => console.log(String(m).slice(0, 200)));
```

Commands:
- `get`, `set`, `preset`, `reset`, `seed`;
- `subscribe` (the packet stream);
- `route.add`, `route.remove`, `session.label`.

Events: `state`, `stats` (every 500 ms), `packets` (every 100 ms while subscribed), `ack`, `error`. The full reference is in [`docs/PROTOCOL.md` §5](../../docs/PROTOCOL.md).

## Safety

- **The control port is the only way in, so it stays on this machine.** It listens on 127.0.0.1 and accepts browser connections only from its own dashboard and the game (`http://localhost:5173`); add more with `--allow-origin`.
  - The reason: anyone who reaches it can open listeners and forward traffic to any host.
  - `--control-host` exposes it on purpose and prints a warning.
- **Data routes are reachable from other machines by default**, as the game's ports are, so others on your LAN can play through the emulator. Tick *this machine only* (or use `--route udp:127.0.0.1:…`) to keep a route local.
- **Don't expose UDP routes, or the game's UDP port, to the internet.** A UDP server that streams replies to any source address can be misused to flood a third party (reflection). See *Multiplayer readiness* in `PHASES.md` (internet play is its future option B).
- **Windows:** the first time a port is opened to other machines, Windows Defender Firewall may ask about `node.exe`. Local use works whatever you answer.

## Optional: watching it in Wireshark

The emulator's traffic is ordinary loopback UDP, so Wireshark shows the impairment directly. Capture on the loopback adapter with the filter `udp.port == 9100 || udp.port == 8081`: packets appear on the 9100 side and are missing (or late) on the 8081 side. On Windows, loopback capture needs Npcap's "loopback adapter" option. That is a system install, so it's your choice; this project doesn't install it.

## Code map

| File | Role |
|---|---|
| `src/main.ts` | command line |
| `src/emulator.ts` | `createEmulator()` (also used by the tests) |
| `src/routes/` | `RouteManager`, WebSocket and UDP routes |
| `src/session.ts` | one client: two links through the pipeline |
| `src/pipeline.ts` | the impairment pipeline (unit-tested, injectable clock) |
| `src/control.ts` | HTTP server: dashboard files + control API |
| `src/presets.ts` | presets and config validation |
| `dashboard/` | the dashboard (plain HTML/CSS/JS, no build) |
| `tools/` | `udp-echo.mjs`, `udp-send.mjs` |
