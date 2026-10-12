/**
 * Private rooms, room codes and the join window (docs/PHASE7_PLAN.md D9, D10;
 * plan tests 1–4).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { GameServer, type GameServerOptions } from '../server/src/core.js';
import { ADJECTIVES, ANIMALS, CODE_COUNT, normalizeCode, formatCode, newCode } from '../shared/src/rooms/codes.js';
import { validateClientMsg } from '../shared/src/protocol/messages.js';
import { mulberry32 } from '../shared/src/sim/prng.js';
import GAME from '../shared/src/config/game.js';

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

// ── Test 3: the private lobby waits for the host ───────────────

describe('Private lobby', () => {
  it('stays WAITING until the host starts; START from a guest is ignored', () => {
    const { s, ticks } = server();
    const a = join(s, 'new', 'A');
    const code = a.welcome()!.code as string;
    const b = join(s, code, 'B');
    ticks(SIM_HZ * 20);
    expect(a.lastSnap()!.match.state).toBe('WAITING');
    expect(a.lastSnap()!.match.waitMsLeft).toBeUndefined();
    b.send({ t: 'start' });
    ticks(2);
    expect(a.lastSnap()!.match.state).toBe('WAITING');
    a.send({ t: 'start' });
    ticks(2);
    const snap = a.lastSnap()!;
    expect(snap.match.state).toBe('COUNTDOWN');
    // Bots fill to the target (2 humans + 2 bots)
    expect(snap.players.length).toBe(GAME.bots.targetParticipants);
    expect(snap.players.filter((p) => p.bot).length).toBe(GAME.bots.targetParticipants - 2);
    ticks(Math.round(GAME.match.countdownMs * SIM_HZ / 1000) + 2);
    expect(a.lastSnap()!.match.state).toBe('RUNNING');
  });

  it('the last human leaving returns the room to WAITING without bots', () => {
    const { s, ticks } = server();
    const a = join(s, 'new', 'A');
    const code = a.welcome()!.code as string;
    a.send({ t: 'start' });
    ticks(2);
    s.removeConnection(a.conn);
    const room = s.rooms.get(code)!;
    expect(room.matchState).toBe('WAITING');
    expect(room.playerCount).toBe(0);
  });
});

// ── Test 4: the join window of main ────────────────────────────

describe('Join window (main)', () => {
  const prevDev = process.env.NOBU_DEV;
  afterEach(() => { process.env.NOBU_DEV = prevDev; });

  it('waits the window with waitMsLeft counting down, then the countdown and bots', () => {
    const { s, ticks } = server({ joinWindowMs: 10_000 });
    const a = join(s, 'main', 'A');
    ticks(2);
    const first = a.lastSnap()!.match;
    expect(first.state).toBe('WAITING');
    expect(first.waitMsLeft).toBeGreaterThan(9_900);
    ticks(SIM_HZ * 5);
    const mid = a.lastSnap()!.match.waitMsLeft as number;
    expect(mid).toBeGreaterThan(4_800);
    expect(mid).toBeLessThan(5_100);
    ticks(SIM_HZ * 5);
    const snap = a.lastSnap()!;
    expect(snap.match.state).toBe('COUNTDOWN');
    expect(snap.match.waitMsLeft).toBeUndefined();
    expect(snap.players.filter((p) => p.bot).length).toBe(GAME.bots.targetParticipants - 1);
  });

  it('ends early once the target number of humans is in', () => {
    const { s, ticks } = server({ joinWindowMs: 10_000 });
    const players = Array.from({ length: GAME.bots.targetParticipants }, (_, i) => join(s, 'main', `H${i}`));
    ticks(2);
    expect(players[0].lastSnap()!.match.state).toBe('COUNTDOWN');
    expect(players[0].lastSnap()!.players.some((p) => p.bot)).toBe(false);
  });

  it('START in main works only under npm run demo (Presenter)', () => {
    const { s, ticks } = server({ joinWindowMs: 10_000 });
    const a = join(s, 'main', 'A');
    delete process.env.NOBU_DEV;
    a.send({ t: 'start' });
    ticks(2);
    expect(a.lastSnap()!.match.state).toBe('WAITING');
    process.env.NOBU_DEV = '1';
    a.send({ t: 'start' });
    ticks(2);
    expect(a.lastSnap()!.match.state).toBe('COUNTDOWN');
  });

  it('a window of 0 keeps the old instant start', () => {
    const { s, ticks } = server({ joinWindowMs: 0 });
    const a = join(s, 'main', 'A');
    ticks(2);
    expect(a.lastSnap()!.match.state).toBe('COUNTDOWN');
  });

  it('everyone leaving during the window stops it; the next human starts a new one', () => {
    const { s, ticks } = server({ joinWindowMs: 10_000 });
    const a = join(s, 'main', 'A');
    ticks(SIM_HZ * 8);
    s.removeConnection(a.conn);
    ticks(SIM_HZ * 5);
    const b = join(s, 'main', 'B');
    ticks(2);
    expect(b.lastSnap()!.match.state).toBe('WAITING');
    expect(b.lastSnap()!.match.waitMsLeft).toBeGreaterThan(9_900);
  });
});
