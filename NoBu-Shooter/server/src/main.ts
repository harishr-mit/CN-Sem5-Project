/**
 * main.ts — NoBu Shooter authoritative game server (WebSocket + UDP adapters).
 * SPEC.md §9. Game logic lives in core.ts / game/room.ts; this file reads the
 * flags, opens the ports (http.ts, udp.ts) and runs the tick loop.
 *
 *   --game            the game server (docs/PHASE7_PLAN.md D6): players only,
 *                     Delta for everyone, no operator messages, no lab room,
 *                     no UDP unless --udp. Also NOBU_MODE=game.
 *   --static <dir>    serve the built game on the same port (`npm start`).
 *   --port <n>        TCP port (default 8080, or PORT).
 *   --udp             open the UDP port in game mode too (network players).
 *   --host <ip>       bind address (or NOBU_HOST; default all interfaces, so
 *                     other machines can join; docs/PHASE5_PLAN.md D15).
 *
 * Without flags it is the demo's server: ws 8080 + udp 8081, everything on.
 */

import { networkInterfaces } from 'os';
import NET from '@nobu/shared/config/net.js';
import GAME from '@nobu/shared/config/game.js';
import { GameServer } from './core.js';
import { createGameHttp } from './http.js';
import { startFixedLoop } from './loop.js';
import { exitWithParent } from './parentWatch.js';
import { startUdpServer, type UdpServerHandle } from './udp.js';

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const option = (name: string) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : undefined;
};

const HOST = option('--host') || process.env.NOBU_HOST || undefined;
const GAME_MODE = flag('--game') || process.env.NOBU_MODE === 'game';
const STATIC_DIR = option('--static');
const PORT = Number(option('--port') || process.env.PORT || NET.ports.server);
const UDP = !GAME_MODE || flag('--udp');
if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
  console.error(`[server] Bad port: ${option('--port') ?? process.env.PORT}`);
  process.exit(1);
}
if (GAME_MODE && process.env.NOBU_DEV === '1') {
  console.error('[server] NOBU_DEV must not be set for the game server (developer tools are demo-only).');
  process.exit(1);
}

const where = (port: number, scheme: string) => HOST ? `${scheme}${HOST}:${port}` : `${scheme}0.0.0.0:${port} (all interfaces; this machine: 127.0.0.1:${port})`;

/** This machine's IPv4 addresses that other machines on the LAN can reach. */
function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

const game = new GameServer(Date.now, { mode: GAME_MODE ? 'game' : 'demo' });
const { http, close: closeHttp } = createGameHttp(game, { staticDir: STATIC_DIR });
let udp: UdpServerHandle | null = null;

http.on('error', (err: NodeJS.ErrnoException) => {
  console.error(`[server] Cannot listen on port ${PORT}: ${err.code === 'EADDRINUSE' ? 'already in use' : err.message}`);
  process.exit(1);
});

http.listen(PORT, HOST, async () => {
  console.log(`[server] ${GAME_MODE ? 'Game' : 'Demo'} server listening on ${where(PORT, 'ws://')}`);
  if (STATIC_DIR) {
    const hosts = HOST && HOST !== '0.0.0.0' ? [HOST] : ['localhost', ...lanAddresses()];
    console.log(`[server] Serving the game from ${STATIC_DIR}. Players open:`);
    for (const h of hosts) console.log(`           http://${h}:${PORT}`);
  }
  if (UDP) {
    try {
      udp = await startUdpServer(game, { port: NET.ports.serverUdp, host: HOST });
      console.log(`[server] Listening on ${where(udp.port, 'udp ')}`);
    } catch (err) {
      console.error(`[server] UDP adapter failed: ${(err as Error).message}`);
      process.exit(1);
    }
  }
  let lastTimeoutCheck = 0;
  await startFixedLoop(GAME.sim.hz, () => game.tick(), () => {
    const t = Date.now();
    if (t - lastTimeoutCheck >= 250) {
      lastTimeoutCheck = t;
      game.checkTimeouts();
    }
  });
});

exitWithParent(() => {
  void udp?.close();
  void closeHttp();
});
