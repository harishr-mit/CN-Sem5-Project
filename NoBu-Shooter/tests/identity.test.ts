/**
 * Player identity: a rejoin with the same hello `pid` keeps the player id
 * (so the colour) and the score; names are unique per room; the lab ignores it.
 */
import { describe, it, expect } from 'vitest';
import { GameServer } from '../server/src/core.js';
import { validateClientMsg } from '../shared/src/protocol/messages.js';

type Msg = Record<string, unknown> & { t: string };
const TOKEN_A = 'aaaaaaaaaaaaaaaa';
const TOKEN_B = 'bbbbbbbbbbbbbbbb';

function join(s: GameServer, hello: Record<string, unknown>) {
  const inbox: Msg[] = [];
  let closed = false;
  const conn = s.addConnection((text) => inbox.push(JSON.parse(text)), () => { closed = true; });
  s.handleMessage(conn, JSON.stringify({ t: 'hello', v: 1, name: 'ALEX', room: 'main', nonce: `n${conn.id}`, ...hello }));
  return { conn, inbox, isClosed: () => closed };
}
// Room.state is private; the tests read the live players through it
const player = (s: GameServer, id: number | null) => (s.getRoom('main') as unknown as { state: { players: Map<number, { score: number; name: string }> } }).state.players.get(id!)!;

describe('player identity (hello pid)', () => {
  it('a rejoin keeps the player id and the score', () => {
    const s = new GameServer(() => 0, { mode: 'game' });
    join(s, { name: 'OTHER' }); // the room stays occupied, so the match goes on (an empty room restarts)
    const a = join(s, { pid: TOKEN_A });
    const id = a.conn.playerId!;
    player(s, id).score = 5;
    s.removeConnection(a.conn);
    expect(() => player(s, id).score).toThrow();
    const again = join(s, { pid: TOKEN_A });
    expect(again.conn.playerId).toBe(id);
    expect(player(s, id).score).toBe(5);
  });

  it('another token is a different player; no token = a new id each time', () => {
    const s = new GameServer(() => 0, { mode: 'game' });
    const a = join(s, { pid: TOKEN_A });
    const b = join(s, { pid: TOKEN_B });
    expect(b.conn.playerId).not.toBe(a.conn.playerId);
    s.removeConnection(a.conn);
    expect(join(s, {}).conn.playerId).not.toBe(a.conn.playerId);
  });

  it('joining while the old connection is open takes the seat over and closes the old one', () => {
    const s = new GameServer(() => 0, { mode: 'game' });
    join(s, { name: 'OTHER' });
    const a = join(s, { pid: TOKEN_A });
    const id = a.conn.playerId!;
    player(s, id).score = 3;
    const b = join(s, { pid: TOKEN_A });
    expect(a.isClosed()).toBe(true);
    expect(b.conn.playerId).toBe(id);
    expect(player(s, id).score).toBe(3);
  });

  it('names are unique per room, case-insensitively: ALEX, ALEX 2, ALEX 3', () => {
    const s = new GameServer(() => 0, { mode: 'game' });
    const a = join(s, { name: 'ALEX', pid: TOKEN_A });
    const b = join(s, { name: 'alex', pid: TOKEN_B });
    const c = join(s, { name: 'Alex' });
    expect(player(s, a.conn.playerId).name).toBe('ALEX');
    expect(player(s, b.conn.playerId).name).toBe('alex 2');
    expect(player(s, c.conn.playerId).name).toBe('Alex 3');
  });

  it('a parked seat keeps its name: a stranger cannot take it; the owner gets it back', () => {
    const s = new GameServer(() => 0, { mode: 'game' });
    const a = join(s, { name: 'ALEX', pid: TOKEN_A });
    s.removeConnection(a.conn);
    const other = join(s, { name: 'ALEX', pid: TOKEN_B });
    expect(player(s, other.conn.playerId).name).toBe('ALEX 2');
    expect(player(s, join(s, { name: 'ALEX', pid: TOKEN_A }).conn.playerId).name).toBe('ALEX');
  });

  it('the longest name still fits with its suffix', () => {
    const s = new GameServer(() => 0, { mode: 'game' });
    join(s, { name: 'ABCDEFGHIJKLMN' });
    const b = join(s, { name: 'ABCDEFGHIJKLMN' });
    expect(player(s, b.conn.playerId).name.length).toBeLessThanOrEqual(12);
    expect(player(s, b.conn.playerId).name.endsWith(' 2')).toBe(true);
  });

  it('a private room keeps seats for its lifetime', () => {
    const s = new GameServer(() => 0, { mode: 'game' });
    const a = join(s, { room: 'new', pid: TOKEN_A });
    const code = a.inbox.find((m) => m.t === 'welcome')!.code as string;
    const id = a.conn.playerId!;
    s.removeConnection(a.conn);
    const again = join(s, { room: code, pid: TOKEN_A });
    expect(again.conn.playerId).toBe(id);
  });

  it('the lab ignores identities (Compare panes share one browser)', () => {
    const s = new GameServer(() => 0);
    const a = join(s, { room: 'lab', pid: TOKEN_A });
    const b = join(s, { room: 'lab', pid: TOKEN_A });
    expect(a.isClosed()).toBe(false);
    expect(b.conn.playerId).not.toBe(a.conn.playerId);
  });

  it('a malformed pid is rejected by the validator', () => {
    const hello = { t: 'hello', v: 1, name: 'A', room: 'main', nonce: 'n' };
    expect(validateClientMsg({ ...hello, pid: TOKEN_A })).not.toBeNull();
    expect(validateClientMsg({ ...hello, pid: 'short' })).toBeNull();
    expect(validateClientMsg({ ...hello, pid: 'has spaces and ***' })).toBeNull();
    expect(validateClientMsg({ ...hello, pid: 5 })).toBeNull();
  });
});
