/**
 * codec.ts — JSON encode/decode helpers for the wire protocol.
 * Keeps encoding/decoding in one place so both ends stay in sync.
 */

import { validateClientMsg, type ClientMsg, type ServerMsg } from './messages.js';

export function encodeServer(msg: ServerMsg): string {
  return JSON.stringify(msg);
}

export function decodeClient(raw: string): ClientMsg | null {
  try {
    const obj = JSON.parse(raw) as unknown;
    return validateClientMsg(obj);
  } catch {
    return null;
  }
}

export function encodeClient(msg: ClientMsg): string {
  return JSON.stringify(msg);
}

export function decodeServer(raw: string): ServerMsg | null {
  try {
    const obj = JSON.parse(raw) as unknown;
    if (typeof obj !== 'object' || obj === null) return null;
    const o = obj as Record<string, unknown>;
    if (typeof o['t'] !== 'string') return null;
    return o as unknown as ServerMsg;
  } catch {
    return null;
  }
}
