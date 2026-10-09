/**
 * vite-dev.mjs — runs the client dev server in-process (one node process),
 * and exits when the launcher dies (NOBU_PARENT_PID), like server/emulator.
 */

import { createServer } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'client');

const server = await createServer({
  root,
  configFile: resolve(root, 'vite.config.ts'),
  server: { port: 5173, strictPort: true },
});
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
