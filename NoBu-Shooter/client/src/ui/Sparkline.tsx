import React, { useEffect, useRef } from 'react';

interface SparklineProps {
  data: number[];
  color?: string;
  min?: number;
  max?: number;
  height?: number;
  label?: string;
  currentValue?: string | number;
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  color = '#00e5ff',
  min,
  max,
  height = 36,
  label,
  currentValue,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (data.length < 2) return;

    const effectiveMin = min !== undefined ? min : Math.min(...data);
    const rawMax = max !== undefined ? max : Math.max(...data);
    const effectiveMax = rawMax === effectiveMin ? effectiveMin + 1 : rawMax;
    const range = effectiveMax - effectiveMin;

    // Background subtle grid line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Resolve CSS variable if passed (e.g., var(--c-green))
    let strokeColor = color;
    if (color.startsWith('var(')) {
      const match = color.match(/var\((--[^)]+)\)/);
      if (match) {
        const val = getComputedStyle(canvas).getPropertyValue(match[1]).trim();
        if (val) strokeColor = val;
      }
    }

    // Draw area gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    try {
      grad.addColorStop(0, `${strokeColor}44`);
      grad.addColorStop(1, `${strokeColor}00`);
      ctx.fillStyle = grad;
    } catch {
      ctx.fillStyle = 'rgba(0, 229, 255, 0.15)';
    }

    ctx.beginPath();
    const step = w / Math.max(1, data.length - 1);

    for (let i = 0; i < data.length; i++) {
      const x = i * step;
      const y = h - ((data[i] - effectiveMin) / range) * (h - 6) - 3;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    // Close path for fill
    ctx.lineTo((data.length - 1) * step, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = i * step;
      const y = h - ((data[i] - effectiveMin) / range) * (h - 6) - 3;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    try {
      ctx.shadowColor = strokeColor;
      ctx.shadowBlur = 4;
    } catch {
      // ignore
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [data, color, min, max]);

  return (
    <div style={{ width: '100%', marginBottom: '4px' }}>
      {(label || currentValue !== undefined) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.68rem',
            color: 'var(--c-text-muted)',
            marginBottom: '2px',
          }}
        >
          <span>{label}</span>
          <span style={{ color }}>{currentValue}</span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={320}
        height={height}
        style={{ width: '100%', height: `${height}px`, display: 'block', background: 'rgba(0,0,0,0.2)', borderRadius: '3px' }}
      />
    </div>
  );
};
