import React, { useEffect, useState } from 'react';
import { NetClient } from '../net/NetClient.js';
import { EmulatorClient } from '../net/EmulatorClient.js';
import { GameContainer } from '../game/GameContainer.js';
import { NetworkLab } from './NetworkLab.js';

const EMULATOR_DATA_URL = 'ws://127.0.0.1:9000';

interface ABCompareProps {
  playerName: string;
  onExit: () => void;
}

export const ABCompare: React.FC<ABCompareProps> = ({ playerName, onExit }) => {
  const [netClientA] = useState(() => {
    const cli = new NetClient({ url: EMULATOR_DATA_URL, name: `${playerName}_A`, room: 'lab', labelPrefix: 'A' });
    cli.toggles.prediction = false;
    cli.toggles.interpolation = false;
    cli.toggles.reconciliation = false;
    cli.toggles.ghost = false;
    return cli;
  });

  const [netClientB] = useState(() => {
    const cli = new NetClient({ url: EMULATOR_DATA_URL, name: `${playerName}_B`, room: 'lab', labelPrefix: 'B' });
    cli.toggles.prediction = true;
    cli.toggles.interpolation = true;
    cli.toggles.reconciliation = true;
    cli.toggles.ghost = true;
    return cli;
  });

  const [emulatorClient] = useState(() => new EmulatorClient('ws://127.0.0.1:9001'));
  const [isLabOpen, setIsLabOpen] = useState(true);

  // Live metrics states
  const [metricsA, setMetricsA] = useState({ ...netClientA.metrics });
  const [metricsB, setMetricsB] = useState({ ...netClientB.metrics });

  // Connect clients. A/B panes are deliberately NOT bound to the global store.
  useEffect(() => {
    netClientA.connect();
    netClientB.connect();
    emulatorClient.connect();

    return () => {
      netClientA.disconnect();
      netClientB.disconnect();
      emulatorClient.close();
    };
  }, [netClientA, netClientB, emulatorClient]);

  // Keyboard is polled by each pane's Phaser scene; the mouse button is
  // shared here so firing/aim intent reaches both clients.
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        netClientA.fireDown = true;
        netClientB.fireDown = true;
      }
    };
    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        netClientA.fireDown = false;
        netClientB.fireDown = false;
      }
    };
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [netClientA, netClientB]);

  // Sample metrics for the comparison readout (NetClient computes them at 5 Hz)
  useEffect(() => {
    const timer = setInterval(() => {
      setMetricsA({ ...netClientA.metrics });
      setMetricsB({ ...netClientB.metrics });
    }, 200);
    return () => clearInterval(timer);
  }, [netClientA, netClientB]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--c-bg)' }}>
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderBottom: '1px solid var(--c-border)',
          background: 'rgba(10, 8, 26, 0.9)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="btn-ghost" onClick={onExit} style={{ padding: '4px 12px' }}>
            ◄ EXIT A/B MODE
          </button>
          <span className="font-display" style={{ fontSize: '1.1rem', color: 'var(--c-cyan)', letterSpacing: '0.1em' }}>
            A/B NETCODE COMPARISON
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--c-text-muted)' }}>
            Synchronized inputs routed into identical network impairment conditions
          </span>
        </div>
      </div>

      {/* Main body: Side by side panes + Network Lab */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Pane A: Server-Only */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--c-border)' }}>
          <div
            style={{
              padding: '6px 12px',
              background: 'rgba(255, 59, 92, 0.1)',
              borderBottom: '1px solid rgba(255, 59, 92, 0.3)',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span className="font-display" style={{ color: 'var(--c-red)', fontSize: '0.85rem' }}>
              PANE A: SERVER-ONLY (PREDICTION OFF, INTERPOLATION OFF)
            </span>
            <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--c-text-muted)' }}>
              OBSERVES RAW SERVER DELAY
            </span>
          </div>

          <div style={{ flex: 1, position: 'relative' }}>
            <GameContainer netClient={netClientA} id="game-canvas-a" />
          </div>

          {/* Metrics bar A */}
          <div
            style={{
              display: 'flex',
              gap: '16px',
              padding: '8px 16px',
              background: 'rgba(0,0,0,0.5)',
              borderTop: '1px solid var(--c-border)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
            }}
          >
            <div>
              <span style={{ color: 'var(--c-text-muted)' }}>INPUT → SCREEN: </span>
              <span style={{ color: 'var(--c-red)', fontWeight: 700 }}>
                {metricsA.inputToScreenMs.toFixed(0)} ms
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--c-text-muted)' }}>CORRECTIONS: </span>
              <span>{metricsA.correctionsPerSec} /s</span>
            </div>
            <div>
              <span style={{ color: 'var(--c-text-muted)' }}>RTT: </span>
              <span>{metricsA.rttMs} ms</span>
            </div>
          </div>
        </div>

        {/* Pane B: Predict + Reconcile */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--c-border)' }}>
          <div
            style={{
              padding: '6px 12px',
              background: 'rgba(0, 229, 255, 0.1)',
              borderBottom: '1px solid rgba(0, 229, 255, 0.3)',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span className="font-display" style={{ color: 'var(--c-cyan)', fontSize: '0.85rem' }}>
              PANE B: PREDICT + RECONCILE (ALL ACTIVE)
            </span>
            <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--c-text-muted)' }}>
              INSTANT LOCAL RESPONSE
            </span>
          </div>

          <div style={{ flex: 1, position: 'relative' }}>
            <GameContainer netClient={netClientB} id="game-canvas-b" />
          </div>

          {/* Metrics bar B */}
          <div
            style={{
              display: 'flex',
              gap: '16px',
              padding: '8px 16px',
              background: 'rgba(0,0,0,0.5)',
              borderTop: '1px solid var(--c-border)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
            }}
          >
            <div>
              <span style={{ color: 'var(--c-text-muted)' }}>INPUT → SCREEN: </span>
              <span style={{ color: 'var(--c-green)', fontWeight: 700 }}>
                {metricsB.inputToScreenMs.toFixed(0)} ms
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--c-text-muted)' }}>CORRECTIONS: </span>
              <span>{metricsB.correctionsPerSec} /s</span>
            </div>
            <div>
              <span style={{ color: 'var(--c-text-muted)' }}>RTT: </span>
              <span>{metricsB.rttMs} ms</span>
            </div>
          </div>
        </div>

        {/* Shared Network Lab panel controlling the emulator for both */}
        <NetworkLab
          netClient={netClientB}
          emulatorClient={emulatorClient}
          isOpen={isLabOpen}
          onToggleOpen={() => setIsLabOpen((v) => !v)}
        />
      </div>
    </div>
  );
};
