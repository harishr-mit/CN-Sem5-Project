import React, { useEffect, useRef } from 'react';

export interface BandwidthSeries {
  id: string;
  color: string;
  /** ↓ wire kbps samples, oldest first (5 Hz). */
  data: number[];
}

interface BandwidthChartProps {
  series: BandwidthSeries[];
  /** The emulator's bandwidth cap (kbps); 0 = uncapped (no line). */
  capKbps: number;
  /** Seconds covered by the data (for the axis label). */
  spanSec: number;
  height: number;
}

/** Round up to a readable axis maximum (1, 2 or 5 × 10ⁿ). */
function niceMax(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1))));
  for (const m of [1, 2, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/**
 * Live ↓ bandwidth per Compare pane (PHASES.md S4): one line per pane in its
 * colour, wire kbps (payload + 28 B per message, the emulator's own units), and
 * a dashed line at the emulator's cap so "above the line = queueing" reads at a glance.
 */
export const BandwidthChart: React.FC<BandwidthChartProps> = ({ series, capKbps, spanSec, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (cssW === 0 || cssH === 0) return;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const padL = 36;
    const padR = 50;
    const padT = 6;
    const padB = 14;
    const w = cssW - padL - padR;
    const h = cssH - padT - padB;
    if (w <= 10 || h <= 10) return;

    const peak = Math.max(1, capKbps * 1.15, ...series.flatMap((s) => s.data));
    const max = niceMax(peak * 1.05);
    const yOf = (v: number) => padT + h - (Math.min(v, max) / max) * h;

    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';

    // Grid + axis labels
    for (const f of [0, 0.5, 1]) {
      const v = max * f;
      const y = yOf(v);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + w, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(232,234,246,0.5)';
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(v)}`, padL - 4, y);
    }
    ctx.textAlign = 'left';
    ctx.fillText(`kbps ↓, last ${spanSec} s`, padL, cssH - 6);

    // Cap line
    if (capKbps > 0) {
      const y = yOf(capKbps);
      ctx.strokeStyle = 'rgba(255, 59, 92, 0.85)';
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255, 59, 92, 0.95)';
      ctx.textAlign = 'right';
      ctx.fillText(`CAP ${capKbps}`, padL + w, y - 7);
    }

    // Lines + current value at the right-hand end
    for (const s of series) {
      if (s.data.length < 2) continue;
      const step = w / (s.data.length - 1);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      s.data.forEach((v, i) => {
        const x = padL + i * step;
        const y = yOf(v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      const last = s.data[s.data.length - 1];
      ctx.fillStyle = s.color;
      ctx.textAlign = 'left';
      ctx.fillText(`${s.id} ${Math.round(last)}`, padL + w + 4, yOf(last));
    }
  });

  return (
    <canvas
      ref={canvasRef}
      id="cmp-bw-chart"
      style={{ width: '100%', height, display: 'block', background: 'rgba(0,0,0,0.25)', borderRadius: 3 }}
    />
  );
};
