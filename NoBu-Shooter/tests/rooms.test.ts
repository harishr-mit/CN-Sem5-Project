/**
 * Private rooms, room codes, room options and the quick match
 * (docs/PHASE7_PLAN.md D9, owner revision R1–R4; plan tests 1–4).
 */
import { describe, it, expect } from 'vitest';
import { GameServer, type GameServerOptions } from '../server/src/core.js';
import { ADJECTIVES, ANIMALS, CODE_COUNT, normalizeCode, formatCode, newCode } from '../shared/src/rooms/codes.js';
import { validateClientMsg } from '../shared/src/protocol/messages.js';
import { mulberry32 } from '../shared/src/sim/prng.js';
import GAME from '../shared/src/config/game.js';
import { defaultRoomOptions, validateRoomOptions, spawnableKinds, type RoomOptions } from '../shared/src/rooms/options.js';
import { initialCombat, makePermanent, stepCombat, applyPowerup, speedMultiplier, PERMANENT } from '../shared/src/sim/combat.js';
import { pickPowerupKind } from '../shared/src/sim/powerups.js';

type Msg = Record<string, unknown> & { t: string };
const SIM_HZ = GAME.sim.hz;

function server(opts: GameServerOptions = {}) {
  let t = 0;
  const s = new GameServer(() => t, { random: mulberry32(7), ...opts });
  return { s, advance: (ms: number) => { t += ms; s.checkTimeouts(); }, ticks: (n: number) => { for (let i = 0; i < n; i++) s.tick(); } };
}

function join(s: GameServer, room: string, name = 'P') {
  const inbox: Msg[] = [];
  const conn = s.addConnection((text) => inbox.push(JSON.parse(text)), () => {});
  s.handleMessage(conn, JSON.stringify({ t: 'hello', v: 1, name, room, nonce: `n${conn.id}` }));
  const welcome = () => inbox.find((m) => m.t === 'welcome');
  const error = () => inbox.find((m) => m.t === 'error');
  const lastSnap = () => [...inbox].reverse().find((m) => m.t === 'snap') as (Msg & { match: Record<string, unknown>; players: { id: number; bot: boolean }[] }) | undefined;
  const send = (m: object) => s.handleMessage(conn, JSON.stringify(m));
  return { conn, inbox, welcome, error, lastSnap, send };
}

// ── Test 1: codes ──────────────────────────────────────────────

describe('Room codes', () => {
  it('normalizes what people type', () => {
    expect(normalizeCode('Blue Fox')).toBe('blue-fox');
    expect(normalizeCode('blue-fox')).toBe('blue-fox');
    expect(normalizeCode('BLUEFOX')).toBe('blue-fox');
    expect(normalizeCode('  blue_fox ')).toBe('blue-fox');
    expect(normalizeCode('fox blue')).toBeNull();
    expect(normalizeCode('blue')).toBeNull();
    expect(normalizeCode('blue fox cat')).toBeNull();
    expect(normalizeCode('main')).toBeNull();
    expect(normalizeCode(42)).toBeNull();
    expect(normalizeCode('x'.repeat(100))).toBeNull();
    expect(formatCode('blue-fox')).toBe('BLUE FOX');
  });

  it('every code without a separator splits only one way', () => {
    for (const a of ADJECTIVES) for (const b of ANIMALS) expect(normalizeCode(a + b)).toBe(`${a}-${b}`);
    expect(new Set(ADJECTIVES).size).toBe(ADJECTIVES.length);
    expect(new Set(ANIMALS).size).toBe(ANIMALS.length);
    expect([...ADJECTIVES, ...ANIMALS].every((w) => /^[a-z]{3,5}$/.test(w))).toBe(true);
  });

  it('picks codes that are not taken, until none are left', () => {
    const rand = mulberry32(1);
    const taken = new Set<string>();
    for (let i = 0; i < CODE_COUNT; i++) {
      const c = newCode(taken, rand);
      expect(c).not.toBeNull();
      expect(taken.has(c!)).toBe(false);
      taken.add(c!);
    }
    expect(newCode(taken, rand)).toBeNull();
  });

  it('hello accepts main / lab / new / a code, made canonical', () => {
    const hello = (room: unknown) => validateClientMsg({ t: 'hello', v: 1, name: 'A', room, nonce: 'x' }) as { room: string } | null;
    expect(hello('main')?.room).toBe('main');
    expect(hello('new')?.room).toBe('new');
    expect(hello('Blue Fox')?.room).toBe('blue-fox');
    expect(hello('nowhere')).toBeNull();
    expect(validateClientMsg({ t: 'start' })).toEqual({ t: 'start' });
  });
});

// ── Test 2: private rooms ──────────────────────────────────────

describe('Private rooms', () => {
  it('create gives a code and makes you host; others join by code and are not host', () => {
    const { s } = server();
    const a = join(s, 'new', 'A');
    const code = a.welcome()?.code as string;
    expect(normalizeCode(code)).toBe(code);
    expect(a.welcome()?.room).toBe(code);
    expect(a.welcome()?.host).toBe(true);
    const b = join(s, formatCode(code), 'B'); // typed as shown
    expect(b.welcome()?.code).toBe(code);
    expect(b.welcome()?.host).toBe(false);
    expect(s.rooms.get(code)?.humanCount).toBe(2);
  });

  it('an unknown code → ROOM_NOT_FOUND; main and lab are not private codes', () => {
    const { s } = server();
    expect(join(s, 'jolly-zebra').error()?.code).toBe('ROOM_NOT_FOUND');
  });

  it('caps the number of private rooms → ROOM_LIMIT', () => {
    const { s } = server({ maxPrivateRooms: 3 });
    for (let i = 0; i < 3; i++) expect(join(s, 'new').welcome()).toBeDefined();
    expect(join(s, 'new').error()?.code).toBe('ROOM_LIMIT');
    expect(s.privateRoomCount).toBe(3);
  });

  it('rooms are isolated: no players or snapshots across rooms', () => {
    const { s, ticks } = server();
    const a = join(s, 'new', 'A');
    const m = join(s, 'main', 'M');
    ticks(3);
    const ids = (snap: ReturnType<typeof a.lastSnap>) => snap!.players.map((p) => p.id);
    expect(ids(a.lastSnap())).not.toContain(m.conn.playerId);
    expect(ids(m.lastSnap())).not.toContain(a.conn.playerId);
    expect(a.lastSnap()!.match.code).toBe(a.welcome()?.code);
    expect(m.lastSnap()!.match.code).toBeUndefined();
  });

  it('the host leaving hands over to the longest-connected human', () => {
    const { s, ticks } = server();
    const a = join(s, 'new', 'A');
    const code = a.welcome()!.code as string;
    const b = join(s, code, 'B');
    const c = join(s, code, 'C');
    s.removeConnection(a.conn);
    expect(s.rooms.get(code)!.hostId).toBe(b.conn.playerId);
    ticks(2);
    expect(c.lastSnap()!.match.hostId).toBe(b.conn.playerId);
  });

  it('an empty room survives the grace period, then is removed', () => {
    const { s, advance } = server({ emptyGraceMs: 60_000 });
    const a = join(s, 'new', 'A');
    const code = a.welcome()!.code as string;
    s.removeConnection(a.conn);
    advance(30_000);
    expect(s.rooms.has(code)).toBe(true);
    const back = join(s, code, 'A'); // a reload rejoins
    expect(back.welcome()?.host).toBe(true);
    s.removeConnection(back.conn);
    advance(59_000);
    expect(s.rooms.has(code)).toBe(true);
    advance(2_000);
    expect(s.rooms.has(code)).toBe(false);
    expect(join(s, code).error()?.code).toBe('ROOM_NOT_FOUND');
  });

  it('a room created but never joined is cleaned up too', () => {
    const { s, advance } = server({ emptyGraceMs: 1_000 });
    const a = join(s, 'new', 'A');
    const code = a.welcome()!.code as string;
    s.removeConnection(a.conn);
    advance(1_500);
    expect(s.rooms.has(code)).toBe(false);
  });
});

// ── Test 3: the private lobby (owner revision R1–R4) ───────────

type Snap = Msg & {
  match: Record<string, unknown> & { options?: RoomOptions };
  players: { id: number; bot: boolean; name: string; alive: boolean; weapon: string; fast: boolean; shield: boolean }[];
  pickups: { kind: string }[];
  me?: Record<string, number | string>;
};
const snapOf = (p: ReturnType<typeof join>) => p.lastSnap() as Snap | undefined;
const COUNTDOWN_TICKS = Math.round(GAME.match.countdownMs * SIM_HZ / 1000);
const MATCH_TICKS = Math.round(GAME.match.durationMs * SIM_HZ / 1000);
const ENDED_TICKS = Math.round(GAME.match.endedMs * SIM_HZ / 1000);

function room2(opts: GameServerOptions = {}) {
  const env = server(opts);
  const a = join(env.s, 'new', 'A');
  const code = a.welcome()!.code as string;
  const b = join(env.s, code, 'B');
  env.ticks(2);
  return { ...env, a, b, code, room: env.s.rooms.get(code)! };
}

describe('Private lobby', () => {
  it('shows only the players who joined (no bots by default), on Neon, with the default options', () => {
    const { a } = room2();
    const snap = snapOf(a)!;
    expect(snap.match.state).toBe('WAITING');
    expect(snap.players.map((p) => p.name).sort()).toEqual(['A', 'B']);
    expect(snap.players.every((p) => !p.bot && p.alive)).toBe(true);
    expect(snap.match.map).toBe('neon');
    expect(snap.match.options).toEqual(defaultRoomOptions());
    expect(snap.match.options!.maxPlayers).toBe(4);
    expect(snap.pickups.length).toBe(GAME.privateRooms.defaults.powerupMax); // preview of where power-ups appear
  });

  it('stays WAITING until the host starts; START from a guest is ignored; no bots join the match', () => {
    const { a, b, ticks } = room2();
    ticks(SIM_HZ * 20);
    expect(snapOf(a)!.match.state).toBe('WAITING');
    b.send({ t: 'start' });
    ticks(2);
    expect(snapOf(a)!.match.state).toBe('WAITING');
    a.send({ t: 'start' });
    ticks(2);
    const snap = snapOf(a)!;
    expect(snap.match.state).toBe('COUNTDOWN');
    expect(snap.players.length).toBe(2);
    expect(snap.players.some((p) => p.bot)).toBe(false);
    ticks(COUNTDOWN_TICKS + 2);
    expect(snapOf(a)!.match.state).toBe('RUNNING');
  });

  it('a lone host cannot start without bots; with bots on the empty slots fill', () => {
    const { s, ticks } = server();
    const a = join(s, 'new', 'A');
    const room = s.rooms.get(a.welcome()!.code as string)!;
    expect(room.canStart).toBe(false);
    a.send({ t: 'start' });
    ticks(2);
    expect(snapOf(a)!.match.state).toBe('WAITING');
    a.send({ t: 'roomOptions', options: { ...defaultRoomOptions(), bots: true, maxPlayers: 5 } });
    ticks(2);
    expect(snapOf(a)!.players.filter((p) => p.bot).length).toBe(4); // shown in the lobby already
    a.send({ t: 'start' });
    ticks(2);
    expect(snapOf(a)!.match.state).toBe('COUNTDOWN');
    expect(snapOf(a)!.players.length).toBe(5);
  });

  it('only the host sets options, only in the lobby; the map shows at once', () => {
    const { a, b, ticks } = room2();
    b.send({ t: 'roomOptions', options: { ...defaultRoomOptions(), map: 'plaza' } });
    ticks(2);
    expect(snapOf(a)!.match.map).toBe('neon');
    a.send({ t: 'roomOptions', options: { ...defaultRoomOptions(), map: 'warehouse' } });
    ticks(2);
    expect(snapOf(b)!.match.map).toBe('warehouse');
    expect(snapOf(b)!.match.options!.map).toBe('warehouse');
    a.send({ t: 'start' });
    ticks(COUNTDOWN_TICKS + 4);
    expect(snapOf(a)!.match.map).toBe('warehouse');
    a.send({ t: 'roomOptions', options: { ...defaultRoomOptions(), map: 'plaza' } }); // running: ignored
    ticks(2);
    expect(snapOf(a)!.match.map).toBe('warehouse');
    expect(snapOf(a)!.match.options!.map).toBe('warehouse');
  });

  it('invalid options are rejected by the validator', () => {
    const bad = [
      { ...defaultRoomOptions(), maxPlayers: 9 },
      { ...defaultRoomOptions(), maxPlayers: 1 },
      { ...defaultRoomOptions(), map: 'moon' },
      { ...defaultRoomOptions(), powerupEveryS: 4 },
      { ...defaultRoomOptions(), powerupMax: 0 },
      { ...defaultRoomOptions(), alwaysOn: { ...defaultRoomOptions().alwaysOn, weapon: 'laser' } },
      { ...defaultRoomOptions(), bots: 'yes' },
    ];
    for (const o of bad) expect(validateRoomOptions(o), JSON.stringify(o)).toBeNull();
    expect(validateRoomOptions({ ...defaultRoomOptions(), map: 'rotation', powerupEveryS: 0 })).not.toBeNull();
    expect(validateClientMsg({ t: 'roomOptions', options: { ...defaultRoomOptions(), maxPlayers: 99 } })).toBeNull();
  });

  it('max players caps the room (ROOM_FULL); bots make way for a human', () => {
    const { s, a, code, ticks } = room2();
    a.send({ t: 'roomOptions', options: { ...defaultRoomOptions(), maxPlayers: 3, bots: true } });
    ticks(2);
    expect(snapOf(a)!.players.length).toBe(3); // 2 humans + 1 bot
    const c = join(s, code, 'C');
    expect(c.welcome()).toBeDefined();
    ticks(2);
    expect(snapOf(a)!.players.filter((p) => !p.bot).length).toBe(3);
    expect(snapOf(a)!.players.some((p) => p.bot)).toBe(false);
    expect(join(s, code, 'D').error()?.code).toBe('ROOM_FULL');
  });

  it('power-ups: the host sets the interval and the max; 0 s = none spawn', () => {
    const { a, ticks } = room2();
    a.send({ t: 'roomOptions', options: { ...defaultRoomOptions(), powerupEveryS: 3, powerupMax: 2 } });
    ticks(2);
    expect(snapOf(a)!.pickups.length).toBe(2);
    a.send({ t: 'start' });
    ticks(COUNTDOWN_TICKS + 4);
    expect(snapOf(a)!.pickups.length).toBe(2);
    a.send({ t: 'bye' });
  });

  it('power-ups off: none in the lobby nor the match', () => {
    const { a, ticks } = room2();
    a.send({ t: 'roomOptions', options: { ...defaultRoomOptions(), powerupEveryS: 0 } });
    ticks(2);
    expect(snapOf(a)!.pickups.length).toBe(0);
    a.send({ t: 'start' });
    ticks(COUNTDOWN_TICKS + SIM_HZ * 20);
    expect(snapOf(a)!.pickups.length).toBe(0);
  });

  it('always-on power-ups: everyone has them for the whole match, and they never spawn', () => {
    const { a, ticks } = room2();
    const alwaysOn = { weapon: 'rapid_fire' as const, shield: true, speed: true, piercing: false, dash: false };
    a.send({ t: 'roomOptions', options: { ...defaultRoomOptions(), powerupMax: 8, powerupEveryS: 3, alwaysOn } });
    ticks(2);
    const lobby = snapOf(a)!;
    expect(lobby.players.every((p) => p.weapon === 'rifle' && p.fast && p.shield)).toBe(true); // shown in the lobby
    expect(lobby.pickups.every((k) => !['rapid_fire', 'spread_shot', 'shield', 'speed'].includes(k.kind))).toBe(true);
    a.send({ t: 'start' });
    ticks(COUNTDOWN_TICKS + SIM_HZ * 60);
    const mid = snapOf(a)!;
    expect(mid.match.state).toBe('RUNNING');
    expect(mid.players.every((p) => p.weapon === 'rifle' && p.fast)).toBe(true);
    expect(mid.me!.weaponTicks).toBe(PERMANENT);
    expect(mid.me!.reserve).toBe(-1); // unlimited reloads
    expect(mid.pickups.every((k) => !['rapid_fire', 'spread_shot', 'shield', 'speed'].includes(k.kind))).toBe(true);
  });

  it('after the match the room goes back to its lobby (scores reset, options kept)', () => {
    const { a, ticks } = room2();
    a.send({ t: 'roomOptions', options: { ...defaultRoomOptions(), map: 'plaza' } });
    a.send({ t: 'start' });
    ticks(COUNTDOWN_TICKS + MATCH_TICKS + 2);
    expect(snapOf(a)!.match.state).toBe('ENDED');
    ticks(ENDED_TICKS + 2);
    const snap = snapOf(a)!;
    expect(snap.match.state).toBe('WAITING');
    expect(snap.match.options!.map).toBe('plaza');
    expect(snap.players.every((p) => p.alive)).toBe(true);
    a.send({ t: 'start' });
    ticks(2);
    expect(snapOf(a)!.match.state).toBe('COUNTDOWN');
  });

  it('the last human leaving returns the room to WAITING without bots', () => {
    const { s, a, b, code, ticks } = room2();
    a.send({ t: 'roomOptions', options: { ...defaultRoomOptions(), bots: true } });
    a.send({ t: 'start' });
    ticks(2);
    s.removeConnection(a.conn);
    s.removeConnection(b.conn);
    const room = s.rooms.get(code)!;
    expect(room.matchState).toBe('WAITING');
    expect(room.playerCount).toBe(0);
  });
});

// ── Test 4: quick match starts at once (owner revision R1) ─────

describe('Quick match (main)', () => {
  it('starts the countdown as soon as a human joins, with bots in the empty slots', () => {
    const { s, ticks } = server();
    const a = join(s, 'main', 'A');
    ticks(2);
    const snap = snapOf(a)!;
    expect(snap.match.state).toBe('COUNTDOWN');
    expect(snap.players.filter((p) => p.bot).length).toBe(GAME.bots.targetParticipants - 1);
    expect(snap.match.options).toBeUndefined();
    expect('waitMsLeft' in snap.match).toBe(false);
  });

  it('START and roomOptions do nothing in main', () => {
    const { s, ticks } = server();
    const a = join(s, 'main', 'A');
    a.send({ t: 'roomOptions', options: { ...defaultRoomOptions(), map: 'plaza' } });
    ticks(2);
    expect(snapOf(a)!.match.options).toBeUndefined();
    expect(s.getRoom('main').start(a.conn.playerId)).toBe(false);
  });
});

// ── Permanent power-ups in the shared combat sim ───────────────

describe('Permanent power-ups (combat sim)', () => {
  it('a permanent weapon never expires and reloads forever; timers stay on', () => {
    const c = makePermanent(initialCombat(), ['rapid_fire', 'speed', 'piercing', 'dash']);
    expect(c.weapon).toBe('rifle');
    expect(c.reserve).toBe(-1);
    for (let i = 0; i < SIM_HZ * 120; i++) stepCombat(c, true, false, false, true);
    expect(c.weapon).toBe('rifle');
    expect(c.weaponTicks).toBe(PERMANENT);
    expect(c.speedTicks).toBe(PERMANENT);
    expect(speedMultiplier(c)).toBe(GAME.powerups.speedMultiplier);
    expect(stepCombat(c, false, false, true, true).dashed || c.dashCooldownTicks > 0).toBe(true);
  });

  it('a pickup never replaces or shortens a permanent power-up', () => {
    const c = makePermanent(initialCombat(), ['spread_shot', 'speed']);
    applyPowerup(c, 'rapid_fire');
    applyPowerup(c, 'speed');
    expect(c.weapon).toBe('shotgun');
    expect(c.weaponTicks).toBe(PERMANENT);
    expect(c.speedTicks).toBe(PERMANENT);
  });

  it('spawnable kinds leave out always-on ones; a weapon excludes both weapons', () => {
    const o = defaultRoomOptions();
    o.alwaysOn = { weapon: 'spread_shot', shield: false, speed: false, piercing: true, dash: false };
    expect(spawnableKinds(o).sort()).toEqual(['dash', 'shield', 'speed']);
    expect(pickPowerupKind(() => 0.5, [])).toBeNull();
  });
});
