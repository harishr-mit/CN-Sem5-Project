export const NET = {
  ports: { client: 5173, server: 8080, emulatorData: 9000, emulatorControl: 9001, serverUdp: 8081, emulatorUdp: 9100 },
  /** UDP datagram discipline: larger messages travel as fragments (docs/PHASE5_PLAN.md D2). */
  udp: { maxDatagram: 1200, reassemblyMs: 250, maxPending: 8 },
  snapshotHz: 30,
  inputSendHz: 30,
  redundancyMax: 10,
  redundancyDefault: false,
  maxInputsPerMessage: 20,
  maxMessagesPerSecond: 120,
  inputBacklogCatchup: { threshold: 3, maxPerTick: 2 },
  interpDelayMs: 100,
  extrapolateMaxMs: 100,
  snapshotBufferSize: 32,
  eventRedundancyMs: 500,
  /** Delta snapshots (docs/PHASE3_PLAN.md D3). */
  delta: { ringSize: 32, maxBaseAgeMs: 1000, clientRingSize: 64 },
  /** State sync + extrapolation (docs/PHASE3_PLAN.md D5, D6). */
  state: { defaultHz: 10, rates: [10, 30], extrapolateMaxMs: 250, extrapolateBackMs: 100, blendHalfLifeMs: 100 },
  /**
   * Lockstep (docs/PHASE6_PLAN.md D3–D6): playout buffer and catch-up (ticks),
   * the server's record ring, the redundant window cap, the hash interval and
   * the NACK retry (× RTT, at least nackRetryMinMs).
   */
  lockstep: { bufferTicks: 2, maxCatchUpTicks: 3, ringTicks: 256, windowMaxTicks: 60, hashEveryTicks: 30, nackRetryRtt: 1.5, nackRetryMinMs: 50 },
  clockSmoothing: 0.05,
  reconcile: { epsilonPx: 0.01, smoothHalfLifeMs: 80, snapThresholdPx: 64 },
  pingIntervalMs: 500,
  helloRetryMs: 250,
  connectGiveUpMs: 10000,
  timeoutMs: 5000,
  metricsWindowMs: 10000,
  debug: { allowPerturb: true, perturbPx: 40 },
} as const;

export default NET;
