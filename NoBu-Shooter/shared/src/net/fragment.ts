/**
 * fragment.ts — UDP datagram discipline (PHASES.md U2, docs/PHASE5_PLAN.md D2).
 *
 * Every UDP datagram is at most `NET.udp.maxDatagram` (1200) bytes. A larger
 * message is split into fragments with an ASCII header, so the emulator's
 * packet log stays readable:
 *
 *     ~<msgId>.<index>/<count>|<bytes>        e.g.  ~k2.0/2|{"t":"snap",…
 *
 * JSON messages always start with "{", so a leading "~" marks a fragment.
 * The receiver reassembles by message id; a message with a fragment still
 * missing after `reassemblyMs`, or pushed out by more than `maxPending`
 * incomplete messages, is dropped — losing one fragment loses the message.
 * Used on UDP only, in both directions; the emulator never reassembles.
 */

import NET from '../config/net.js';

const MARK = 0x7e; // "~"
const SEP = 0x7c; // "|"
const MAX_FRAGMENTS = 64;

/** Splits outgoing messages; one per sender (message ids are per sender). */
export class Fragmenter {
  private nextId = 0;
  constructor(private readonly maxDatagram: number = NET.udp.maxDatagram) {}

  /** The datagrams for one message: itself when it fits, else fragments. */
  split(text: string): Buffer[] {
    const bytes = Buffer.from(text, 'utf8');
    if (bytes.length <= this.maxDatagram && bytes[0] !== MARK) return [bytes];
    const id = (this.nextId++ % 0x7fffffff).toString(36);
    // The header length depends on the count; size the chunks for the widest header
    let count = Math.ceil(bytes.length / (this.maxDatagram - 16));
    for (;;) {
      const header = `~${id}.${count - 1}/${count}|`.length;
      const need = Math.ceil(bytes.length / (this.maxDatagram - header));
      if (need <= count) break;
      count = need;
    }
    if (count > MAX_FRAGMENTS) throw new Error(`message of ${bytes.length} B needs more than ${MAX_FRAGMENTS} fragments`);
    const out: Buffer[] = [];
    let offset = 0;
    for (let i = 0; i < count; i++) {
      const header = Buffer.from(`~${id}.${i}/${count}|`, 'ascii');
      const room = this.maxDatagram - header.length;
      const end = i === count - 1 ? bytes.length : Math.min(bytes.length, offset + room);
      out.push(Buffer.concat([header, bytes.subarray(offset, end)]));
      offset = end;
    }
    return out;
  }
}

interface Pending {
  parts: (Buffer | undefined)[];
  got: number;
  first: number;
}

export interface ReassemblerOptions {
  timeoutMs?: number;
  maxPending?: number;
}

/** Reassembles one sender's datagrams (keep one per peer). */
export class Reassembler {
  private readonly pending = new Map<string, Pending>();
  /** Recently completed ids: late duplicate fragments of them are ignored. */
  private readonly done: string[] = [];
  private readonly timeoutMs: number;
  private readonly maxPending: number;
  /** Fragments received (incl. duplicates). */
  fragmentsIn = 0;
  /** Messages completed from fragments. */
  messagesReassembled = 0;
  /** Messages lost because a fragment never came. */
  messagesDropped = 0;
  /** Datagrams that were neither a message nor a valid fragment. */
  malformed = 0;

  constructor(opts: ReassemblerOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? NET.udp.reassemblyMs;
    this.maxPending = opts.maxPending ?? NET.udp.maxPending;
  }

  /** One datagram in; a complete message out (or null while waiting / on garbage). */
  push(datagram: Buffer, now: number): string | null {
    this.purge(now);
    if (datagram.length === 0) return null;
    if (datagram[0] !== MARK) return datagram.toString('utf8');
    this.fragmentsIn++;
    const sep = datagram.indexOf(SEP);
    const m = sep > 0 ? /^~([0-9a-z]{1,8})\.(\d{1,3})\/(\d{1,3})$/.exec(datagram.toString('ascii', 0, sep)) : null;
    if (!m) { this.malformed++; return null; }
    const id = m[1];
    const index = Number(m[2]);
    const count = Number(m[3]);
    if (count < 1 || count > MAX_FRAGMENTS || index >= count) { this.malformed++; return null; }
    if (this.done.includes(id)) return null;
    let p = this.pending.get(id);
    if (!p) {
      p = { parts: new Array(count), got: 0, first: now };
      this.pending.set(id, p);
      while (this.pending.size > this.maxPending) {
        const oldest = this.pending.keys().next().value as string;
        this.pending.delete(oldest);
        this.messagesDropped++;
      }
    }
    if (p.parts.length !== count) { this.malformed++; return null; }
    if (p.parts[index]) return null; // duplicate
    p.parts[index] = datagram.subarray(sep + 1);
    p.got++;
    if (p.got < count) return null;
    this.pending.delete(id);
    this.done.push(id);
    if (this.done.length > 64) this.done.shift();
    this.messagesReassembled++;
    return Buffer.concat(p.parts as Buffer[]).toString('utf8');
  }

  /** Drop messages whose fragments did not all arrive in time. */
  purge(now: number): void {
    for (const [id, p] of this.pending) {
      if (now - p.first > this.timeoutMs) {
        this.pending.delete(id);
        this.messagesDropped++;
      }
    }
  }

  get pendingCount(): number {
    return this.pending.size;
  }
}
