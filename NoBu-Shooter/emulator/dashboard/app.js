/*
 * Emulator dashboard (docs/PHASE5_PLAN.md D12). Plain JS, no build, no
 * libraries. Talks only to the control API on the same host:port that served
 * this page, so everything here can also be scripted (docs/PROTOCOL.md §5).
 * Labels and payload previews come from arbitrary traffic: they are only ever
 * rendered with textContent.
 */
(() => {
  'use strict';

  const CTL_URL = `ws://${location.host}`;
  const HISTORY = 120; // samples (500 ms) = 60 s

  const FIELDS = [
    { k: 'latencyMs', name: 'Latency', unit: 'ms', min: 0, max: 1000, step: 5 },
    { k: 'jitterMs', name: 'Jitter', unit: 'ms', min: 0, max: 300, step: 1 },
    { k: 'jitterDist', name: 'Jitter distribution', options: ['normal', 'uniform'] },
    { k: 'lossPct', name: 'Loss', unit: '%', min: 0, max: 100, step: 0.5 },
    { k: 'lossModel', name: 'Loss model', options: ['random', 'burst'] },
    { k: 'burstLen', name: 'Burst length', unit: 'pkts', min: 1, max: 20, step: 1 },
    { k: 'duplicatePct', name: 'Duplicate', unit: '%', min: 0, max: 50, step: 0.5 },
    { k: 'reorderPct', name: 'Reorder', unit: '%', min: 0, max: 50, step: 0.5 },
    { k: 'reorderDelayMs', name: 'Reorder delay', unit: 'ms', min: 0, max: 500, step: 5 },
    { k: 'bandwidthKbps', name: 'Bandwidth cap', unit: 'kbps', min: 0, max: 10000, step: 50, zero: 'unlimited' },
    { k: 'queueLimitMs', name: 'Queue limit', unit: 'ms', min: 0, max: 2000, step: 10 },
    { k: 'allowJitterReorder', name: 'Jitter may reorder', bool: true },
  ];

  // ── State ─────────────────────────────────────────────────────
  let ws = null;
  let state = { routes: [], sessions: [], presets: [], defaults: {}, preset: '' };
  let stats = { sessions: [] };
  let target = 'all';
  let direction = 'both';
  let editingUntil = 0;
  const pendingPatch = {};
  let patchTimer = null;
  const history = new Map(); // key → samples
  const created = new Map(); // session id → createdAt (ms)
  const labels = new Map(); // session id → label (kept after a session ends)
  let logRows = [];
  let logPaused = false;
  let logDirty = false;

  const $ = (id) => document.getElementById(id);
  function el(tag, props, ...children) {
    const e = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === undefined || v === null) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v);
      }
    }
    for (const c of children) if (c !== null && c !== undefined) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return e;
  }
  const send = (cmd) => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(cmd)); };

  // ── Connection ────────────────────────────────────────────────
  function connect() {
    $('ctl-url').textContent = CTL_URL;
    const sock = new WebSocket(CTL_URL);
    ws = sock;
    sock.onopen = () => {
      setConn(true);
      if (!logPaused) send({ cmd: 'subscribe', packets: true });
      send({ cmd: 'get' });
    };
    sock.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.evt === 'state') onState(m);
      else if (m.evt === 'stats') onStats(m);
      else if (m.evt === 'packets') onPackets(m.items || []);
      else if (m.evt === 'error') showError(`${m.cmd}: ${m.msg}`);
      else if (m.evt === 'ack') onAck(m);
    };
    sock.onclose = () => {
      if (ws !== sock) return;
      setConn(false);
      setTimeout(connect, 1500);
    };
  }
  function setConn(on) {
    const p = $('conn');
    p.textContent = on ? 'CONNECTED' : 'OFFLINE — retrying';
    p.className = `pill ${on ? 'pill-on' : 'pill-off'}`;
  }

  // ── Events ────────────────────────────────────────────────────
  function onState(m) {
    state = m;
    const now = Date.now();
    for (const s of m.sessions) {
      if (!created.has(s.id)) created.set(s.id, now - (s.ageMs || 0));
      labels.set(s.id, s.label);
    }
    if (target !== 'all' && !findRoute(target) && !findSession(target)) target = 'all';
    $('global-preset').textContent = `all routes: ${m.preset}`;
    renderRoutes();
    renderTargets();
    renderPresets();
    renderSliders();
    renderSessions();
    renderLogFilter();
  }

  function onStats(m) {
    stats = m;
    for (const s of m.sessions) labels.set(s.id, s.label);
    const t = m.t;
    record('all', t, m.sessions);
    for (const r of state.routes) record(r.id, t, m.sessions.filter((s) => s.route === r.id));
    for (const s of m.sessions) record(s.id, t, [s]);
    const live = new Set(['all', ...state.routes.map((r) => r.id), ...m.sessions.map((s) => s.id)]);
    for (const k of history.keys()) if (!live.has(k)) history.delete(k);
    renderSessions();
    drawCharts();
  }

  function onAck(m) {
    if (m.cmd === 'route.add') {
      showError('');
      $('rf-port').value = '';
      target = m.id;
    }
  }

  function showError(msg) { $('route-error').textContent = msg; }

  // ── Aggregates + history ──────────────────────────────────────
  function agg(list, dir) {
    let kbps = 0, inW = 0, lossW = 0, queue = 0;
    for (const s of list) {
      const d = s[dir] || {};
      kbps += d.throughputKbps || 0;
      inW += d.pktsInWindow || 0;
      lossW += (d.lossPctWindow || 0) * (d.pktsInWindow || 0);
      queue = Math.max(queue, d.queueMs || 0);
    }
    return { kbps, loss: inW > 0 ? lossW / inW : 0, queue };
  }
  function record(key, t, list) {
    const up = agg(list, 'up');
    const down = agg(list, 'down');
    let h = history.get(key);
    if (!h) { h = []; history.set(key, h); }
    h.push({ t, up, down });
    if (h.length > HISTORY) h.shift();
  }

  // ── Routes ────────────────────────────────────────────────────
  const findRoute = (id) => state.routes.find((r) => r.id === id);
  const findSession = (id) => state.sessions.find((s) => s.id === id);

  function renderRoutes() {
    const body = $('routes-table').querySelector('tbody');
    body.replaceChildren();
    for (const r of state.routes) {
      const tr = el('tr', { class: target === r.id ? 'sel' : '', onclick: () => selectTarget(r.id) },
        el('td', null, el('span', { class: `tag ${r.proto}`, text: r.proto.toUpperCase() }), ' ', el('span', { class: 'mono', text: r.id })),
        el('td', { class: 'mono', text: `${r.host || 'all interfaces'}:${r.port}` }),
        el('td', { class: 'mono', text: r.target }),
        el('td', { class: 'clip', text: r.preset, title: r.preset }),
        el('td', { class: 'num', text: r.refused ? `${r.sessions} (${r.refused} refused)` : String(r.sessions) }),
        el('td', null, el('button', {
          class: 'btn small danger', type: 'button', text: 'REMOVE',
          onclick: (e) => {
            e.stopPropagation();
            if (confirm(`Remove route ${r.id}? Its ${r.sessions} session(s) are closed.`)) send({ cmd: 'route.remove', id: r.id });
          },
        })),
      );
      body.append(tr);
    }
    $('routes-empty').hidden = state.routes.length > 0;
    $('routes-table').hidden = state.routes.length === 0;
  }

  function setupRouteForm() {
    const proto = $('rf-proto');
    const tgt = $('rf-target');
    const update = () => { tgt.placeholder = proto.value === 'ws' ? 'ws://127.0.0.1:8080' : '127.0.0.1:7000'; };
    proto.addEventListener('change', update);
    update();
    $('route-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const port = Number($('rf-port').value);
      const cmd = { cmd: 'route.add', proto: proto.value, port, target: tgt.value.trim() };
      if ($('rf-local').checked) cmd.host = '127.0.0.1';
      showError('');
      send(cmd);
    });
  }

  // ── Sessions ──────────────────────────────────────────────────
  function renderSessions() {
    const body = $('sessions-table').querySelector('tbody');
    body.replaceChildren();
    const byId = new Map(stats.sessions.map((s) => [s.id, s]));
    const now = Date.now();
    for (const s of state.sessions) {
      const st = byId.get(s.id) || s;
      const up = st.up || {};
      const down = st.down || {};
      const age = Math.max(0, Math.round((now - (created.get(s.id) || now)) / 1000));
      body.append(el('tr', { class: target === s.id ? 'sel' : '', onclick: () => selectTarget(s.id) },
        el('td', { text: st.label || s.label }),
        el('td', null, el('span', { class: `tag ${s.proto}`, text: s.route })),
        el('td', { class: 'mono', text: s.peer }),
        el('td', { class: 'num', text: age < 120 ? `${age}s` : `${Math.round(age / 60)}m` }),
        el('td', { class: 'num dir-up', text: String(up.throughputKbps ?? 0) }),
        el('td', { class: 'num dir-down', text: String(down.throughputKbps ?? 0) }),
        el('td', { class: 'num', text: `${(up.lossPctWindow ?? 0).toFixed(0)} / ${(down.lossPctWindow ?? 0).toFixed(0)} %` }),
        el('td', { class: 'num', text: `${up.queueMs ?? 0} / ${down.queueMs ?? 0} ms` }),
      ));
    }
    $('sessions-empty').hidden = state.sessions.length > 0;
  }

  // ── Target + controls ─────────────────────────────────────────
  function selectTarget(t) {
    target = t;
    renderRoutes();
    renderTargets();
    renderPresets();
    renderSliders();
    renderSessions();
    drawCharts();
  }

  function targetName(t) {
    if (t === 'all') return 'all routes';
    const r = findRoute(t);
    if (r) return `route ${r.id}`;
    const s = findSession(t);
    return s ? `session ${s.label} (${s.route})` : t;
  }

  function renderTargets() {
    const sel = $('target');
    sel.replaceChildren(el('option', { value: 'all', text: 'All routes (and routes added later)' }));
    for (const r of state.routes) sel.append(el('option', { value: r.id, text: `Route ${r.id} → ${r.target}` }));
    for (const s of state.sessions) sel.append(el('option', { value: s.id, text: `Session ${s.label} · ${s.route}` }));
    sel.value = target;
    $('chart-target').textContent = targetName(target);
  }

  /** The target's config in the selected direction; "both" shows up and flags fields that differ. */
  function currentConfig() {
    let up, down;
    const r = findRoute(target);
    const s = findSession(target);
    if (r) { up = r.defaults; down = r.defaultsDown || r.defaults; }
    else if (s) { up = s.up; down = s.down; }
    else { up = state.defaults; down = state.defaultsDown || state.defaults; }
    if (direction === 'up') return { cfg: up, mixed: {} };
    if (direction === 'down') return { cfg: down, mixed: {} };
    const mixed = {};
    for (const f of FIELDS) if (up && down && up[f.k] !== down[f.k]) mixed[f.k] = true;
    return { cfg: up, mixed };
  }

  function activePreset() {
    if (target === 'all') return state.preset;
    const r = findRoute(target);
    return r ? r.preset : null;
  }

  function renderPresets() {
    const box = $('presets');
    box.replaceChildren();
    const active = activePreset();
    for (const name of state.presets || []) {
      box.append(el('button', {
        type: 'button', class: name === active ? 'on' : '', text: name,
        title: `Apply ${name} to ${targetName(target)} (both directions)`,
        onclick: () => send({ cmd: 'preset', target, name }),
      }));
    }
    box.append(el('button', { type: 'button', class: 'reset', text: 'RESET', title: 'No impairment', onclick: () => send({ cmd: 'reset', target }) }));
  }

  function fmtVal(f, v) {
    if (f.bool) return v ? 'on' : 'off';
    if (f.options) return v;
    if (f.zero && v === 0) return f.zero;
    return `${v} ${f.unit}`;
  }

  function renderSliders() {
    if (Date.now() < editingUntil) return;
    const box = $('sliders');
    box.replaceChildren();
    const { cfg, mixed } = currentConfig();
    for (const f of FIELDS) {
      const v = cfg ? cfg[f.k] : undefined;
      const val = el('span', { class: 'val', text: v === undefined ? '—' : fmtVal(f, v) + (mixed[f.k] ? ' (up)' : '') });
      let input;
      if (f.options) {
        input = el('select', { 'aria-label': f.name });
        for (const o of f.options) input.append(el('option', { value: o, text: o }));
        input.value = v;
        input.addEventListener('change', () => queuePatch(f.k, input.value, val, f));
      } else if (f.bool) {
        input = el('select', { 'aria-label': f.name });
        input.append(el('option', { value: 'false', text: 'off' }), el('option', { value: 'true', text: 'on' }));
        input.value = String(!!v);
        input.addEventListener('change', () => queuePatch(f.k, input.value === 'true', val, f));
      } else {
        input = el('input', { type: 'range', min: f.min, max: f.max, step: f.step, 'aria-label': f.name });
        input.value = String(v ?? 0);
        input.addEventListener('input', () => queuePatch(f.k, Number(input.value), val, f));
      }
      box.append(el('div', { class: `slider${mixed[f.k] ? ' mixed' : ''}` }, el('span', { class: 'name', text: f.name }), val, input));
    }
  }

  function queuePatch(k, v, valEl, f) {
    editingUntil = Date.now() + 800;
    valEl.textContent = fmtVal(f, v);
    pendingPatch[k] = v;
    clearTimeout(patchTimer);
    patchTimer = setTimeout(() => {
      const patch = { ...pendingPatch };
      for (const key of Object.keys(pendingPatch)) delete pendingPatch[key];
      send({ cmd: 'set', target, direction, patch });
    }, 120);
  }

  function setupControls() {
    $('target').addEventListener('change', (e) => selectTarget(e.target.value));
    for (const b of $('direction').querySelectorAll('button')) {
      b.addEventListener('click', () => {
        direction = b.dataset.dir;
        for (const x of $('direction').querySelectorAll('button')) x.classList.toggle('on', x === b);
        editingUntil = 0;
        renderSliders();
      });
    }
  }

  // ── Charts ────────────────────────────────────────────────────
  const css = getComputedStyle(document.documentElement);
  const C_UP = css.getPropertyValue('--up').trim() || '#00e5ff';
  const C_DOWN = css.getPropertyValue('--down').trim() || '#ff2bd6';

  function niceMax(v, floor) {
    const m = Math.max(v, floor);
    const p = Math.pow(10, Math.floor(Math.log10(m)));
    for (const k of [1, 2, 2.5, 5, 10]) if (m <= k * p) return k * p;
    return 10 * p;
  }

  function drawChart(canvas, samples, pick, floor, unit) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    let max = 0;
    for (const s of samples) max = Math.max(max, pick(s.up), pick(s.down));
    const top = niceMax(max, floor);
    const padL = 40, padR = 6, padT = 6, padB = 6;
    const pw = w - padL - padR, ph = h - padT - padB;
    g.font = '10px Consolas, monospace';
    g.fillStyle = 'rgba(232,234,246,0.45)';
    g.strokeStyle = 'rgba(255,255,255,0.06)';
    g.lineWidth = 1;
    for (const f of [0, 0.5, 1]) {
      const y = padT + ph * (1 - f);
      g.beginPath(); g.moveTo(padL, y); g.lineTo(w - padR, y); g.stroke();
      g.fillText(`${Math.round(top * f)}${f === 1 ? ` ${unit}` : ''}`, 2, y + 3);
    }
    const x = (i) => padL + (pw * (i + HISTORY - samples.length)) / (HISTORY - 1);
    for (const [dir, color] of [['up', C_UP], ['down', C_DOWN]]) {
      g.strokeStyle = color;
      g.lineWidth = 1.6;
      g.beginPath();
      samples.forEach((s, i) => {
        const y = padT + ph * (1 - pick(s[dir]) / top);
        if (i === 0) g.moveTo(x(i), y); else g.lineTo(x(i), y);
      });
      g.stroke();
    }
    if (samples.length === 0) {
      g.fillStyle = 'rgba(232,234,246,0.35)';
      g.fillText('no traffic yet', padL + 8, padT + ph / 2);
    }
  }

  function drawCharts() {
    const samples = history.get(target) || [];
    $('chart-target').textContent = targetName(target);
    drawChart($('ch-kbps'), samples, (d) => d.kbps, 10, 'kbps');
    drawChart($('ch-loss'), samples, (d) => d.loss, 10, '%');
    drawChart($('ch-queue'), samples, (d) => d.queue, 50, 'ms');
  }

  // ── Packet log ────────────────────────────────────────────────
  function onPackets(items) {
    if (logPaused) return;
    for (const it of items) logRows.unshift(it);
    if (logRows.length > 500) logRows.length = 500;
    logDirty = true;
  }

  function renderLogFilter() {
    const sel = $('lf-session');
    const cur = sel.value;
    sel.replaceChildren(el('option', { value: '', text: 'all' }));
    for (const s of state.sessions) sel.append(el('option', { value: s.id, text: s.label }));
    sel.value = [...sel.options].some((o) => o.value === cur) ? cur : '';
  }

  function renderLog() {
    if (!logDirty) return;
    logDirty = false;
    const fs = $('lf-session').value, fd = $('lf-dir').value, ff = $('lf-fate').value;
    const body = $('log-table').querySelector('tbody');
    const frag = document.createDocumentFragment();
    let shown = 0;
    for (const r of logRows) {
      if (fs && r.sid !== fs) continue;
      if (fd && r.dir !== fd) continue;
      if (ff === 'reordered' ? !r.reordered : ff && r.fate !== ff) continue;
      shown++;
      const fate = r.fate === 'dropped-loss' ? 'lost' : r.fate === 'dropped-queue' ? 'queue drop' : r.fate;
      frag.append(el('tr', null,
        el('td', { text: new Date(r.t).toISOString().slice(11, 23) }),
        el('td', { text: labels.get(r.sid) || r.sid }),
        el('td', { class: `dir-${r.dir}`, text: r.dir === 'up' ? '↑ up' : '↓ down' }),
        el('td', { class: 'num', text: String(r.size) }),
        el('td', { class: `fate-${r.fate}` }, fate, r.reordered ? el('span', { class: 'reo', text: ' ⇄' }) : null),
        el('td', { class: 'num', text: `${r.delayMs} ms` }),
        el('td', { class: 'payload', text: r.preview, title: r.preview }),
      ));
    }
    body.replaceChildren(frag);
    $('log-count').textContent = `${shown} of ${logRows.length}${logPaused ? ' · paused' : ''}`;
  }

  function setupLog() {
    for (const id of ['lf-session', 'lf-dir', 'lf-fate']) $(id).addEventListener('change', () => { logDirty = true; renderLog(); });
    $('log-pause').addEventListener('click', () => {
      logPaused = !logPaused;
      $('log-pause').textContent = logPaused ? 'RESUME' : 'PAUSE';
      $('log-pause').classList.toggle('on', logPaused);
      send({ cmd: 'subscribe', packets: !logPaused });
      logDirty = true;
      renderLog();
    });
    $('log-clear').addEventListener('click', () => { logRows = []; logDirty = true; renderLog(); });
    setInterval(renderLog, 250);
  }

  // ── Start ─────────────────────────────────────────────────────
  setupRouteForm();
  setupControls();
  setupLog();
  window.addEventListener('resize', drawCharts);
  drawCharts();
  connect();
})();
