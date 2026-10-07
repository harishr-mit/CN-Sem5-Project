import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from './store.js';
import type { PacketEvent } from '../net/EmulatorClient.js';

interface PacketFlowStripProps {
  onToggleInspector?: () => void;
  isInspectorOpen?: boolean;
}

interface AnimatedDot {
  id: number;
  dir: 'up' | 'down'; // up: left -> right; down: right -> left
  fate: 'delivered' | 'dropped-loss' | 'dropped-queue' | 'duplicated';
  delayMs: number;
  progress: number; // 0 to 1
  phase: 'enter' | 'inside' | 'exit' | 'dropped';
  insideTimer: number; // ms spent inside emulator box
  color: string;
}

export const PacketFlowStrip: React.FC<PacketFlowStripProps> = ({
  onToggleInspector,
  isInspectorOpen = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const packetEvents = useGameStore((s) => s.packetEvents);
  const emulatorStats = useGameStore((s) => s.emulatorStats);

  const dotsRef = useRef<AnimatedDot[]>([]);
  const nextDotId = useRef(1);
  const lastProcessedIdx = useRef(0);

  // Read active impairments from emulatorStats or state
  const upStats = emulatorStats[0]?.up;
  const downStats = emulatorStats[0]?.down;

  // Process incoming packet events into animated dots
  useEffect(() => {
    if (packetEvents.length === 0) return;
    const newEvents = packetEvents.slice(lastProcessedIdx.current);
    lastProcessedIdx.current = packetEvents.length;

    // Limit intake to prevent dot flooding (at most 20 dots added per batch)
    const sampled = newEvents.slice(-15);
    for (const ev of sampled) {
      const color =
        ev.fate === 'dropped-loss'
          ? '#ff3b5c'
          : ev.fate === 'dropped-queue'
          ? '#ffb300'
          : ev.dir === 'up'
          ? '#00e5ff'
          : '#ff2bd6';

      dotsRef.current.push({
        id: nextDotId.current++,
        dir: ev.dir,
        fate: ev.fate,
        delayMs: Math.min(600, Math.max(0, ev.delayMs)),
        progress: 0,
        phase: 'enter',
        insideTimer: 0,
        color,
      });

      // If duplicated, spawn a companion dot
      if (ev.fate === 'duplicated') {
        dotsRef.current.push({
          id: nextDotId.current++,
          dir: ev.dir,
          fate: 'delivered',
          delayMs: Math.min(600, Math.max(0, ev.delayMs + 20)),
          progress: 0,
          phase: 'enter',
          insideTimer: 0,
          color,
        });
      }
    }

    // Keep active dot pool reasonable
    if (dotsRef.current.length > 80) {
      dotsRef.current = dotsRef.current.slice(-60);
    }
  }, [packetEvents]);

  // Main canvas animation loop (60 FPS)
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(50, now - lastTime);
      lastTime = now;

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;

          ctx.clearRect(0, 0, w, h);

          // Geometry
          const leftNodeX = 60;
          const rightNodeX = w - 60;
          const boxW = 160;
          const boxH = 52;
          const boxX = w / 2 - boxW / 2;
          const boxY = (h - boxH) / 2;

          const upLaneY = h * 0.35;
          const downLaneY = h * 0.65;

          // Background connection rails
          ctx.strokeStyle = 'rgba(124, 77, 255, 0.2)';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);

          // Upstream rail
          ctx.beginPath();
          ctx.moveTo(leftNodeX, upLaneY);
          ctx.lineTo(rightNodeX, upLaneY);
          ctx.stroke();

          // Downstream rail
          ctx.beginPath();
          ctx.moveTo(leftNodeX, downLaneY);
          ctx.lineTo(rightNodeX, downLaneY);
          ctx.stroke();

          ctx.setLineDash([]);

          // Draw YOU node (left)
          ctx.fillStyle = '#00e5ff';
          ctx.beginPath();
          ctx.arc(leftNodeX, upLaneY, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = '10px "Rajdhani", sans-serif';
          ctx.fillStyle = '#e8eaf6';
          ctx.textAlign = 'right';
          ctx.fillText('YOU', leftNodeX - 10, h / 2 + 4);

          // Draw SERVER node (right)
          ctx.fillStyle = '#b6ff3b';
          ctx.beginPath();
          ctx.arc(rightNodeX, downLaneY, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.textAlign = 'left';
          ctx.fillText('SERVER', rightNodeX + 10, h / 2 + 4);

          // Draw EMULATOR center box
          ctx.fillStyle = 'rgba(10, 8, 26, 0.9)';
          ctx.strokeStyle = 'rgba(124, 77, 255, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.fillRect(boxX, boxY, boxW, boxH);
          ctx.strokeRect(boxX, boxY, boxW, boxH);

          ctx.textAlign = 'center';
          ctx.fillStyle = 'var(--c-text)';
          ctx.font = '11px "Orbitron", sans-serif';
          ctx.fillText('EMULATOR', w / 2, boxY + 16);

          ctx.font = '9px "JetBrains Mono", monospace';
          ctx.fillStyle = 'rgba(232, 234, 246, 0.6)';
          ctx.fillText('IMPAIRMENT ENGINE', w / 2, boxY + 30);

          // Animate and draw dots
          const aliveDots: AnimatedDot[] = [];

          for (const dot of dotsRef.current) {
            const laneY = dot.dir === 'up' ? upLaneY : downLaneY;
            const startX = dot.dir === 'up' ? leftNodeX : rightNodeX;
            const targetBoxEdgeX = dot.dir === 'up' ? boxX : boxX + boxW;
            const exitBoxEdgeX = dot.dir === 'up' ? boxX + boxW : boxX;
            const endX = dot.dir === 'up' ? rightNodeX : leftNodeX;

            let curX = startX;
            let curY = laneY;
            let alpha = 1;
            let radius = 3.5;

            if (dot.phase === 'enter') {
              dot.progress += dt / 140; // ~140ms to reach box
              curX = startX + (targetBoxEdgeX - startX) * Math.min(1, dot.progress);

              if (dot.progress >= 1) {
                if (dot.fate === 'dropped-queue') {
                  dot.phase = 'dropped';
                  dot.progress = 0;
                } else if (dot.fate === 'dropped-loss') {
                  dot.phase = 'dropped';
                  dot.progress = 0;
                } else {
                  dot.phase = 'inside';
                  dot.insideTimer = 0;
                }
              }
              aliveDots.push(dot);
            } else if (dot.phase === 'inside') {
              dot.insideTimer += dt;
              curX = dot.dir === 'up' ? boxX + 20 : boxX + boxW - 20;

              // Exit once delay elapsed
              if (dot.insideTimer >= dot.delayMs * 0.6) {
                dot.phase = 'exit';
                dot.progress = 0;
              }
              aliveDots.push(dot);
            } else if (dot.phase === 'exit') {
              dot.progress += dt / 140;
              curX = exitBoxEdgeX + (endX - exitBoxEdgeX) * Math.min(1, dot.progress);

              if (dot.progress < 1) {
                aliveDots.push(dot);
              }
            } else if (dot.phase === 'dropped') {
              // Burst and fall animation
              dot.progress += dt / 250;
              curX = targetBoxEdgeX;
              curY = laneY + dot.progress * 16;
              alpha = Math.max(0, 1 - dot.progress);
              radius = 4 + dot.progress * 3;

              if (dot.progress < 1) {
                aliveDots.push(dot);
              }
            }

            // Draw dot
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = dot.color;
            ctx.shadowColor = dot.color;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(curX, curY, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }

          dotsRef.current = aliveDots;
        }
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div className="packet-strip" id="packet-flow-strip">
      <canvas
        ref={canvasRef}
        width={1280}
        height={72}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />

      {/* Packet Inspector Drawer Toggle Button */}
      {onToggleInspector && (
        <button
          id="toggle-inspector-btn"
          className="btn-ghost"
          style={{
            position: 'absolute',
            right: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '0.72rem',
            padding: '4px 8px',
            borderColor: isInspectorOpen ? 'var(--c-cyan)' : 'var(--c-border)',
            color: isInspectorOpen ? 'var(--c-cyan)' : 'var(--c-text-muted)',
            fontFamily: 'var(--font-mono)',
          }}
          onClick={onToggleInspector}
        >
          {isInspectorOpen ? '▲ HIDE INSPECTOR' : '▼ INSPECT PACKETS'}
        </button>
      )}
    </div>
  );
};
