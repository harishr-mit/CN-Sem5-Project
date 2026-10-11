#!/usr/bin/env node
/**
 * udp-echo.mjs — a generic UDP app for trying the emulator without the game
 * (emulator/README.md, docs/PHASE5_PLAN.md D13). Node built-ins only.
 *
 *   node emulator/tools/udp-echo.mjs --port 7000 [--host 127.0.0.1] [--quiet]
 *
 * Prints every datagram it receives and sends it straight back to the sender.
 */

import dgram from 'dgram';

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const port = Number(arg('port', '7000'));
const host = arg('host', '127.0.0.1');
const quiet = args.includes('--quiet');

const sock = dgram.createSocket(host.includes(':') ? 'udp6' : 'udp4');
let count = 0;
sock.on('message', (msg, r) => {
  count++;
  if (!quiet) {
    const text = /^[\x20-\x7e\t\r\n]*$/.test(msg.toString('latin1')) ? msg.toString('latin1') : `hex ${msg.toString('hex')}`;
    console.log(`[echo] #${count} from ${r.address}:${r.port} (${msg.length} B): ${text.slice(0, 80)}`);
  }
  sock.send(msg, r.port, r.address);
});
sock.on('error', (err) => { console.error(`[echo] ${err.message}`); process.exit(1); });
sock.bind(port, host, () => console.log(`[echo] listening on udp ${host}:${port} — Ctrl+C to stop`));
process.on('SIGINT', () => { console.log(`\n[echo] ${count} datagram(s) echoed`); sock.close(() => process.exit(0)); });
