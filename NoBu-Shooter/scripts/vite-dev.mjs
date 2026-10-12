/**
 * vite-dev.mjs — runs a client dev server in-process (one node process),
 * and exits when the launcher dies (NOBU_PARENT_PID), like server/emulator.
 *
 *   node scripts/vite-dev.mjs          the demo (client/, this machine only)
 *   node scripts/vite-dev.mjs --game   the game edition (client/play, on the
 *                                      LAN too, /ws proxied to the game server;
 *                                      client/vite.play.config.ts)
 */

import { createServer } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const clientDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'client');
const game = process.argv.includes('--game');

const server = await createServer(game
  ? { configFile: resolve(clientDir, 'vite.play.config.ts'), server: { port: 5173, strictPort: true } }
  : { root: clientDir, configFile: resolve(clientDir, 'vite.config.ts'), server: { port: 5173, strictPort: true } });
await server.listen();
server.printUrls();

const parentPid = Number(process.env.NOBU_PARENT_PID);
if (parentPid) {
  setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch {
      server.close().finally(() => process.exit(0));
    }
  }, 1000).unref();
}
