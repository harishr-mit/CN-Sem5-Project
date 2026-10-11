import React, { useEffect, useRef } from 'react';
import { useGameStore } from './store.js';

interface PacketFlowStripProps {
  onToggleInspector?: () => void;
  isInspectorOpen?: boolean;
  /** Emulator session label of the viewing client (NetClient.label); only its packets are drawn. */
  sessionLabel?: string;
}

interface LinkDefaults {
  latencyMs?: number; jitterMs?: number; lossPct?: number; bandwidthKbps?: number;
  duplicatePct?: number; reorderPct?: number; lossModel?: string; queueLimitMs?: number;
}

/** Short chips describing the active impairments, e.g. "LAT 120" "LOSS 12%". */
function impairmentChips(d: LinkDefaults | undefined): string[] {
  if (!d) return [];
  const chips: string[] = [];
  if (d.latencyMs) chips.push(`LAT ${d.latencyMs}`);
  if (d.jitterMs) chips.push(`JIT ±${d.jitterMs}`);
  if (d.lossPct) chips.push(`LOSS ${d.lossPct}%${d.lossModel === 'burst' ? ' B' : ''}`);
  if (d.bandwidthKbps) chips.push(`BW ${d.bandwidthKbps >= 1000 ? `${d.bandwidthKbps / 1000}M` : `${d.bandwidthKbps}k`}`);
  if (d.duplicatePct) chips.push(`DUP ${d.duplicatePct}%`);
  if (d.reorderPct) chips.push(`REORD ${d.reorderPct}%`);
  return chips;
}

/**
 * One packet on its real timeline (PHASES.md P5). Times are wall-clock ms:
 * `at` = when it reached the emulator (the event's `t`), `delay` = how long
 * the emulator held it (queue + latency + jitter + reorder hold).
 */
interface Dot {
  dir: 'up' | 'down';
  fate: 'delivered' | 'dropped-loss' | 'dropped-queue' | 'duplicated';
  at: number;
  delay: number;
  reordered: boolean;
  color: string;
}

/** Travel time between a node and the emulator box (drawing only). */
const TRAVEL_MS = 140;
/** Burst-and-fall of a dropped packet. */
const DROP_MS = 260;
/** Longest delay drawn inside the box; longer ones keep the box full. */
const MAX_DELAY_MS = 1500;
/** Replay lag bounds: the strip runs this far behind real time (a jitter buffer). */
const LAG_MIN_MS = 250;
const LAG_MAX_MS = 2200;
const COLORS = {
  up: '#00e5ff', down: '#ff2bd6', loss: '#ff3b5c', queue: '#ffb300', dup: '#c6b5ff', text: '#e8eaf6',
};

export const PacketFlowStrip: React.FC<PacketFlowStripProps> = ({
  onToggleInspector,
  isInspectorOpen = false,
  sessionLabel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const packetEvents = useGameStore((s) => s.packetEvents);
  const packetTotal = useGameStore((s) => s.packetTotal);
  const emulatorStats = useGameStore((s) => s.emulatorStats);
  const emulatorState = useGameStore((s) => s.emulatorState) as { defaults?: LinkDefaults } | null;

  const dotsRef = useRef<Dot[]>([]);
  const lastProcessedTotal = useRef(0);
  /** How far behind real time events arrive (receipt − t), recent samples. */
  const arrivalLag = useRef<{ at: number; lag: number }[]>([]);
  const chipsRef = useRef<string[]>([]);
  chipsRef.current = impairmentChips(emulatorState?.defaults);

  const mine = sessionLabel ? emulatorStats.find((s) => s.label === sessionLabel) : undefined;
  const mySid = mine?.id;
  // Queue depth per direction (emulator stats, 2 Hz) and the queue limit (tail drops beyond it)
  const queueRef = useRef({ up: 0, down: 0, limit: 400, cap: 0 });
  queueRef.current = {
    up: mine?.up['queueMs'] ?? 0,
    down: mine?.down['queueMs'] ?? 0,
    limit: emulatorState?.defaults?.queueLimitMs ?? 400,
    cap: emulatorState?.defaults?.bandwidthKbps ?? 0,
  };

  // New packet events → dots. The store keeps only the last 300 events, so
  // new ones are found via the monotonic total.
  useEffect(() => {
    const fresh = Math.min(packetTotal - lastProcessedTotal.current, packetEvents.length);
    lastProcessedTotal.current = packetTotal;
    if (fresh <= 0) return;
    const now = Date.now();
    const newEvents = packetEvents
      .slice(packetEvents.length - fresh)
      .filter((ev) => !sessionLabel || ev.sid === mySid);

    for (const ev of newEvents.slice(-30)) {
      const delay = ev.fate === 'delivered' ? Math.min(MAX_DELAY_MS, Math.max(0, ev.delayMs)) : 0;
      // Delivered events are sent after delivery: they arrive ≈ delay + flush after t
      arrivalLag.current.push({ at: now, lag: Math.max(0, now - ev.t) });
      dotsRef.current.push({
        dir: ev.dir,
        fate: ev.fate,
        at: ev.t,
        delay,
        reordered: !!ev.reordered,
        color: ev.fate === 'dropped-loss' ? COLORS.loss
          : ev.fate === 'dropped-queue' ? COLORS.queue
          : ev.fate === 'duplicated' ? COLORS.dup
          : ev.dir === 'up' ? COLORS.up : COLORS.down,
      });
    }
    // Keep the pool bounded (oldest first)
    if (dotsRef.current.length > 240) dotsRef.current = dotsRef.current.slice(-180);
  }, [packetEvents, packetTotal, sessionLabel, mySid]);

  // Main canvas animation loop
  useEffect(() => {
    let animId: number;
    let lastFrame = performance.now();
    let lag = LAG_MIN_MS;
    const shown = { up: 0, down: 0 };

    const loop = (frameNow: number) => {
      const dt = Math.min(50, frameNow - lastFrame);
      lastFrame = frameNow;
      const now = Date.now();

      // Replay lag follows the slowest recent arrival (2 s window), smoothly,
      // so every packet can be drawn from the moment it reached the emulator.
      arrivalLag.current = arrivalLag.current.filter((s) => now - s.at < 2000);
      const worst = arrivalLag.current.reduce((m, s) => Math.max(m, s.lag), 0);
      const target = Math.min(LAG_MAX_MS, Math.max(LAG_MIN_MS, worst + TRAVEL_MS + 60));
      lag += (target - lag) * Math.min(1, dt / (target > lag ? 300 : 2000));
      const t = now - lag;

      // Queue bars ease towards the latest stats
      const q = queueRef.current;
      shown.up += (q.up - shown.up) * Math.min(1, dt / 150);
      shown.down += (q.down - shown.down) * Math.min(1, dt / 150);

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        // Match the backing store to the displayed size so text isn't stretched
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth || 1000;
        const h = canvas.clientHeight || 72;
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        // Geometry
        const leftNodeX = 64;
        const rightNodeX = w - 64;
        const boxW = Math.min(300, Math.max(200, w * 0.32));
        const boxH = h - 12;
        const boxX = w / 2 - boxW / 2;
        const boxY = 6;
        // Lanes sit between the box's text line (top) and its queue line (bottom)
        const upLaneY = h * 0.4;
        const downLaneY = h * 0.63;

        // Rails
        ctx.strokeStyle = 'rgba(124, 77, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        for (const y of [upLaneY, downLaneY]) {
          ctx.beginPath();
          ctx.moveTo(leftNodeX, y);
          ctx.lineTo(rightNodeX, y);
          ctx.stroke();
        }
        ctx.setLineDash([]);

        // Nodes
        ctx.font = '600 12px "Rajdhani", sans-serif';
        ctx.fillStyle = COLORS.up;
        ctx.beginPath(); ctx.arc(leftNodeX, upLaneY, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = COLORS.text;
        ctx.textAlign = 'right';
        ctx.fillText('YOU', leftNodeX - 12, h / 2 + 4);
        ctx.fillStyle = '#b6ff3b';
        ctx.beginPath(); ctx.arc(rightNodeX, downLaneY, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = COLORS.text;
        ctx.textAlign = 'left';
        ctx.fillText('SERVER', rightNodeX + 10, h / 2 + 4);

        // Emulator box
        ctx.fillStyle = 'rgba(10, 8, 26, 0.9)';
        ctx.strokeStyle = 'rgba(124, 77, 255, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeRect(boxX, boxY, boxW, boxH);
        // Top line: title left, active impairments right
        ctx.textAlign = 'left';
        ctx.fillStyle = COLORS.text;
        ctx.font = '9px "Orbitron", sans-serif';
        ctx.fillText('EMULATOR', boxX + 6, boxY + 11);
        const titleW = ctx.measureText('EMULATOR').width;
        const chips = chipsRef.current;
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillStyle = chips.length ? COLORS.queue : 'rgba(232, 234, 246, 0.6)';
        let chipText = chips.length ? chips.join(' · ') : 'NO IMPAIRMENT';
        const room = boxW - titleW - 18;
        while (chipText.length > 1 && ctx.measureText(chipText).width > room) chipText = chipText.slice(0, -2) + '…';
        ctx.textAlign = 'right';
        ctx.fillText(chipText, boxX + boxW - 6, boxY + 11);

        // Bottom line: queue depth (bufferbloat) = how long a packet arriving now
        // waits for the cap. Downstream queues (snapshots); upstream shown if it does.
        const qMs = Math.max(shown.down, shown.up);
        const frac = Math.min(1, qMs / Math.max(1, q.limit));
        const qColor = q.cap ? (frac > 0.75 ? COLORS.loss : COLORS.queue) : 'rgba(232, 234, 246, 0.45)';
        const qText = q.cap
          ? `QUEUE ↓${Math.round(shown.down)}${shown.up >= 5 ? ` ↑${Math.round(shown.up)}` : ''} ms`
          : 'QUEUE — no cap';
        const lineY = boxY + boxH - 4;
        ctx.textAlign = 'left';
        ctx.fillStyle = qColor;
        ctx.fillText(qText, boxX + 6, lineY);
        const barX = boxX + 6 + Math.max(ctx.measureText(qText).width, 70) + 6;
        const barW = boxX + boxW - 6 - barX;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(barX, lineY - 6, barW, 5);
        if (frac > 0.005) {
          ctx.fillStyle = qColor;
          ctx.fillRect(barX, lineY - 6, barW * frac, 5);
        }
        // Tail-drop limit marker at the end of the bar
        ctx.fillStyle = 'rgba(255, 59, 92, 0.7)';
        ctx.fillRect(barX + barW - 1, lineY - 8, 1.5, 9);

        // Dots on their real timelines, `lag` behind real time
        const alive: Dot[] = [];
        for (const d of dotsRef.current) {
          const laneY = d.dir === 'up' ? upLaneY : downLaneY;
          const startX = d.dir === 'up' ? leftNodeX : rightNodeX;
          const inX = d.dir === 'up' ? boxX : boxX + boxW;
          const outX = d.dir === 'up' ? boxX + boxW : boxX;
          const endX = d.dir === 'up' ? rightNodeX : leftNodeX;
          const dropped = d.fate === 'dropped-loss' || d.fate === 'dropped-queue';
          const endsAt = dropped || d.fate === 'duplicated' ? d.at + DROP_MS : d.at + d.delay + TRAVEL_MS;
          if (t >= endsAt) continue;
          alive.push(d);
          if (t < d.at - TRAVEL_MS) continue; // not on screen yet

          let x: number;
          let y = laneY;
          let alpha = 1;
          let r = 3.5;
          if (t < d.at) {
            x = startX + (inX - startX) * (1 - (d.at - t) / TRAVEL_MS);
          } else if (dropped) {
            const k = (t - d.at) / DROP_MS;
            x = inX; y = laneY + k * 16; alpha = 1 - k; r = 4 + 3 * k;
          } else if (d.fate === 'duplicated') {
            // Split flash where the copy is made; both copies follow as normal dots
            const k = (t - d.at) / DROP_MS;
            ctx.save();
            ctx.globalAlpha = 1 - k;
            ctx.strokeStyle = d.color;
            ctx.lineWidth = 1.5;
            for (const off of [-4 - 4 * k, 4 + 4 * k]) {
              ctx.beginPath(); ctx.arc(inX + (d.dir === 'up' ? 6 : -6), laneY + off, 3, 0, Math.PI * 2); ctx.stroke();
            }
            ctx.restore();
            continue;
          } else if (t < d.at + d.delay) {
            const k = d.delay > 0 ? (t - d.at) / d.delay : 1;
            x = inX + (outX - inX) * (0.04 + 0.92 * k);
          } else {
            x = outX + (endX - outX) * ((t - d.at - d.delay) / TRAVEL_MS);
          }

          // Halo as a second, faint circle: canvas shadowBlur on ~200 dots per
          // frame (a full Nightmare queue) cost enough to trip the bloom auto-off
          ctx.save();
          const a = Math.max(0, alpha);
          ctx.fillStyle = d.color;
          ctx.globalAlpha = a * 0.25;
          ctx.beginPath();
          ctx.arc(x, y, r + 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          if (d.reordered) {
            // Held back by the reorder stage: white ring, overtaken by later packets
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(x, y, r + 2.5, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        }
        dotsRef.current = alive;
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div className="packet-strip" id="packet-flow-strip">
      <canvas ref={canvasRef} className="packet-strip-canvas" />

      <div className="packet-strip-side">
        {/* Legend (PHASES.md P5) */}
        <div className="packet-legend" id="packet-legend">
          <span><i style={{ background: COLORS.up }} />UP</span>
          <span><i style={{ background: COLORS.down }} />DOWN</span>
          <span><i className="ring" />REORDERED</span>
          <span><i style={{ background: COLORS.loss }} />LOST</span>
          <span><i style={{ background: COLORS.queue }} />QUEUE DROP</span>
          <span><i className="twin" />DUPLICATE</span>
          <span><i className="bar" />QUEUE</span>
        </div>

        {/* Packet Inspector Drawer Toggle Button */}
        {onToggleInspector && (
          <button
            id="toggle-inspector-btn"
            className="btn-ghost"
            style={{
              fontSize: '0.68rem',
              padding: '3px 8px',
              borderColor: isInspectorOpen ? 'var(--c-cyan)' : 'var(--c-border)',
              color: isInspectorOpen ? 'var(--c-cyan)' : 'var(--c-text-muted)',
              fontFamily: 'var(--font-mono)',
              whiteSpace: 'nowrap',
            }}
            onClick={onToggleInspector}
          >
            {isInspectorOpen ? '▲ HIDE INSPECTOR' : '▼ INSPECT PACKETS'}
          </button>
        )}
      </div>
    </div>
  );
};
