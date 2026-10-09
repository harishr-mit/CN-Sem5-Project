import React, { useEffect, useState } from 'react';
import { NetClient, type LocalMetrics } from '../net/NetClient.js';
import { EmulatorClient } from '../net/EmulatorClient.js';
import { GameContainer } from '../game/GameContainer.js';
import { createPointerState, type PointerState } from '../game/input.js';
import { NetworkLab } from './NetworkLab.js';
import { useGameStore } from './store.js';

const EMULATOR_DATA_URL = 'ws://127.0.0.1:9000';

interface ABCompareProps {
  playerName: string;
  onExit: () => void;
}

/**
 * Two "twin" players in the lab room, one per pane. Both spawn at the lab
 * spawn point, read the same keyboard and the same pointer, and step on the
 * same 60 Hz frames, so their authoritative paths are identical; only the
 * netcode differs (A: prediction / reconciliation / interpolation off,
 * B: all on). Each pane hides the other pane's twin.
 */
export const ABCompare: React.FC<ABCompareProps> = ({ playerName, onExit }) => {
  const [netClientA] = useState(() => {
    const cli = new NetClient({ url: EMULATOR_DATA_URL, name: `${playerName}_A`, room: 'lab', labelPrefix: 'A' });
    cli.toggles.prediction = false;
    cli.toggles.interpolation = false;
    cli.toggles.reconciliation = false;
    cli.toggles.ghost = false;
    // Lost inputs would make the twins drift apart for good; the Lab can turn it off.
    cli.toggles.redundancy = true;
    return cli;
  });

  const [netClientB] = useState(() => {
    const cli = new NetClient({ url: EMULATOR_DATA_URL, name: `${playerName}_B`, room: 'lab', labelPrefix: 'B' });
    cli.toggles.prediction = true;
    cli.toggles.interpolation = true;
    cli.toggles.reconciliation = true;
    cli.toggles.ghost = true;
    cli.toggles.redundancy = true;
    return cli;
  });

  // Stable identities: GameContainer rebuilds the Phaser game when these change.
  const [pointer] = useState(createPointerState);
  const [bothClients] = useState(() => [netClientA, netClientB]);
  const [hideInA] = useState(() => [netClientB]);
  const [hideInB] = useState(() => [netClientA]);

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

  // Sample metrics for the comparison readout (NetClient computes them at 5 Hz)
  useEffect(() => {
    const timer = setInterval(() => {
      setMetricsA({ ...netClientA.metrics });
      setMetricsB({ ...netClientB.metrics });
    }, 200);
    return () => clearInterval(timer);
  }, [netClientA, netClientB]);

  // Rejoin both twins at the lab spawn (e.g. after loss made them drift apart).
  const handleResync = () => {
    for (const c of bothClients) {
      c.disconnect();
      c.connect();
    }
  };

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
            Twin players: same spawn, same keys and mouse, identical impairment settings on both links
          </span>
        </div>
        <button
          id="ab-resync-btn"
          className="btn-ghost"
          onClick={handleResync}
          style={{ padding: '4px 12px', fontSize: '0.8rem' }}
          title="Rejoin both twins at the lab spawn point"
        >
          ⟲ RE-SYNC TWINS
        </button>
      </div>

      {/* Main body: Side by side panes + Network Lab */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <ComparePane
          id="game-canvas-a"
          title="PANE A: SERVER-ONLY (PREDICTION, RECONCILIATION, INTERPOLATION OFF)"
          subtitle="OBSERVES RAW SERVER DELAY"
          accent="var(--c-red)"
          tint="255, 59, 92"
          netClient={netClientA}
          hide={hideInA}
          pointer={pointer}
          metrics={metricsA}
        />
        <ComparePane
          id="game-canvas-b"
          title="PANE B: PREDICT + RECONCILE + INTERPOLATE (ALL ON)"
          subtitle="INSTANT LOCAL RESPONSE"
          accent="var(--c-cyan)"
          tint="0, 229, 255"
          netClient={netClientB}
          hide={hideInB}
          pointer={pointer}
          metrics={metricsB}
        />

        {/* Shared Network Lab panel: impairments apply to both panes' sessions */}
        <NetworkLab
          netClient={netClientB}
          emulatorClient={emulatorClient}
          isOpen={isLabOpen}
          onToggleOpen={() => setIsLabOpen((v) => !v)}
          compareClients={bothClients}
        />
      </div>
    </div>
  );
};

interface ComparePaneProps {
  id: string;
  title: string;
  subtitle: string;
  accent: string;
  /** "r, g, b" of the accent, for translucent fills. */
  tint: string;
  netClient: NetClient;
  hide: NetClient[];
  pointer: PointerState;
  metrics: LocalMetrics;
}

const ComparePane: React.FC<ComparePaneProps> = ({ id, title, subtitle, accent, tint, netClient, hide, pointer, metrics }) => {
  // Ground-truth loss from this pane's own emulator session (last 1 s)
  const session = useGameStore((s) => s.emulatorStats.find((st) => st.label === netClient.label));
  const lossUp = session?.up['lossPctWindow'] ?? 0;
  const lossDown = session?.down['lossPctWindow'] ?? 0;

  const stat = (label: string, value: React.ReactNode, color?: string) => (
    <div>
      <span style={{ color: 'var(--c-text-muted)' }}>{label} </span>
      <span style={{ color, fontWeight: color ? 700 : undefined }}>{value}</span>
    </div>
  );

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--c-border)' }}>
      <div
        style={{
          padding: '6px 12px',
          background: `rgba(${tint}, 0.1)`,
          borderBottom: `1px solid rgba(${tint}, 0.3)`,
          display: 'flex',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <span className="font-display" style={{ color: accent, fontSize: '0.85rem' }}>{title}</span>
        <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--c-text-muted)' }}>{subtitle}</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <GameContainer netClient={netClient} pointer={pointer} hidePlayersOf={hide} id={id} />
      </div>

      {/* Per-pane metrics bar */}
      <div
        id={`${id}-metrics`}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          columnGap: '16px',
          rowGap: '2px',
          padding: '8px 16px',
          background: 'rgba(0,0,0,0.5)',
          borderTop: '1px solid var(--c-border)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8rem',
        }}
      >
        {stat('INPUT → SCREEN:', `${metrics.inputToScreenMs.toFixed(0)} ms`, accent)}
        {stat('ACK:', `${metrics.ackDelayMs} ms`)}
        {stat('RTT:', `${metrics.rttMs} ms`)}
        {stat('CORRECTIONS:', `${metrics.correctionsPerSec} /s`)}
        {stat('LOSS ↑↓:', `${lossUp} / ${lossDown} %`)}
        {stat('BW ↓:', `${metrics.bwDownKbps} kbps`)}
      </div>
    </div>
  );
};
