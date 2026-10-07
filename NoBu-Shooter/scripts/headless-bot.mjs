/**
 * headless-bot.mjs — standalone headless bot client for load and smoke testing.
 * SPEC.md §5, §14.
 */

import { WebSocket } from 'ws';

const args = process.argv.slice(2);
function getArg(name, def) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
}

const targetUrl = getArg('--url', 'ws://127.0.0.1:9000?label=HeadlessBot');
const durationSec = parseInt(getArg('--duration', '10'), 10);
const botName = getArg('--name', 'SMOKE_BOT');

console.log(`[bot] Connecting to ${targetUrl} (duration: ${durationSec}s)...`);

const ws = new WebSocket(targetUrl);
let playerId = null;
let seq = 0;
let highestAck = 0;
let snapshotsReceived = 0;
let lastSnapTick = -1;
let serverTickHz = 0;
let inputInterval = null;

const nonce = Math.random().toString(36).slice(2);

let helloInterval = null;

ws.on('open', () => {
  console.log('[bot] Connected. Sending handshake...');
  const sendHello = () => {
    if (playerId === null) {
      send({
        t: 'hello',
        v: 1,
        name: botName,
        room: 'main',
        nonce,
      });
    }
  };
  sendHello();
  helloInterval = setInterval(sendHello, 250);
});

ws.on('message', (raw) => {
  try {
    const msg = JSON.parse(raw.toString());
    if (msg.t === 'welcome') {
      if (helloInterval) {
        clearInterval(helloInterval);
        helloInterval = null;
      }
      playerId = msg.playerId;
      console.log(`[bot] Welcomed by server as playerId=${playerId}`);
      startInputLoop();
    } else if (msg.t === 'snap') {
      snapshotsReceived++;
      if (msg.tick > lastSnapTick) {
        lastSnapTick = msg.tick;
      }
      if (msg.ack > highestAck) {
        highestAck = msg.ack;
      }
    } else if (msg.t === 'pong') {
      serverTickHz = msg.tickHz || serverTickHz;
    }
  } catch (err) {
    console.error('[bot] Malformed packet:', err);
  }
});

function send(data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function startInputLoop() {
  // Ping at 2 Hz
  setInterval(() => {
    send({ t: 'ping', id: 1, ct: Date.now() });
  }, 500);

  // Inputs at 30 Hz
  inputInterval = setInterval(() => {
    seq++;
    // Move in a small circular pattern
    const k = [1, 8, 2, 4][seq % 4];
    send({
      t: 'input',
      inputs: [{ s: seq, k, a: 0, f: 0 }],
    });
  }, 1000 / 30);
}

// Run for specified duration then report
setTimeout(() => {
  if (inputInterval) clearInterval(inputInterval);
  ws.close();

  console.log('\n[bot] Run complete.');
  console.log(`  Snapshots received: ${snapshotsReceived}`);
  console.log(`  Highest input ack:  ${highestAck} / ${seq}`);
  console.log(`  Last snapshot tick: ${lastSnapTick}`);
  console.log(`  Server tick rate:   ${serverTickHz} Hz`);

  const ok = snapshotsReceived > 50 && highestAck > 0;
  if (ok) {
    console.log('\x1b[32m[bot] SMOKE TEST PASSED\x1b[0m');
    process.exit(0);
  } else {
    console.error('\x1b[31m[bot] SMOKE TEST FAILED (insufficient snapshots or acks)\x1b[0m');
    process.exit(1);
  }
}, durationSec * 1000);
