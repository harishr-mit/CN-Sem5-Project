#!/usr/bin/env node
/**
 * udp-send.mjs — a generic UDP client for trying the emulator without the game
 * (emulator/README.md, docs/PHASE5_PLAN.md D13). Node built-ins only.
 *
 *   node emulator/tools/udp-send.mjs --to 9100 [--host 127.0.0.1] [--rate 5] [--count 0] [--text hello]
 *
 * Sends "#<n> <text>" at --rate messages per second (--count 0 = until Ctrl+C)
 * and prints each echo, the numbers that never came back and the round trip.
 * Point it at an emulator route whose target is udp-echo, and turn the loss
 * up on the dashboard: numbers go missing.
 */

import dgram from 'dgram';

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const port = Number(arg('to', '9100'));
const host = arg('host', '127.0.0.1');
const rate = Math.max(0.2, Number(arg('rate', '5')));
const total = Number(arg('count', '0'));
const text = arg('text', 'hello');
const timeoutMs = 2000;

const sock = dgram.createSocket(host.includes(':') ? 'udp6' : 'udp4');
const sentAt = new Map();
let sent = 0;
let received = 0;
let lost = 0;
let rttSum = 0;

sock.on('message', (msg) => {
  const m = /^#(\d+) /.exec(msg.toString());
  if (!m) return;
  const n = Number(m[1]);
  const t = sentAt.get(n);
  if (t === undefined) {
    console.log(`[send] #${n} came back again (duplicate)`);
    return;
  }
  sentAt.delete(n);
  received++;
  const rtt = Date.now() - t;
  rttSum += rtt;
  console.log(`[send] ✓ #${n} back after ${rtt} ms`);
});
sock.on('error', () => { /* ICMP unreachable while the route/echo is not up yet */ });

function sweep(final = false) {
  const now = Date.now();
  for (const [n, t] of sentAt) {
    if (final || now - t > timeoutMs) {
      sentAt.delete(n);
      lost++;
      console.log(`[send] ✗ #${n} never came back`);
    }
  }
}

function summary() {
  sweep(true);
  const pct = sent ? ((100 * lost) / sent).toFixed(1) : '0';
  const avg = received ? Math.round(rttSum / received) : 0;
  console.log(`\n[send] sent ${sent}, back ${received}, lost ${lost} (${pct} %), average round trip ${avg} ms`);
}

console.log(`[send] sending "#<n> ${text}" to udp ${host}:${port} at ${rate}/s${total ? `, ${total} message(s)` : ''} — Ctrl+C to stop`);
const timer = setInterval(() => {
  sweep();
  if (total && sent >= total) {
    clearInterval(timer);
    setTimeout(() => { summary(); sock.close(); }, timeoutMs);
    return;
  }
  sent++;
  sentAt.set(sent, Date.now());
  sock.send(Buffer.from(`#${sent} ${text}`), port, host);
}, 1000 / rate);

process.on('SIGINT', () => { clearInterval(timer); summary(); sock.close(() => process.exit(0)); });
