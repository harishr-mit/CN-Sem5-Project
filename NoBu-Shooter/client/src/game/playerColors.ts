/**
 * playerColors.ts — one colour per player, shared by the arena (ring, name
 * tag) and the HUD scoreboard (GAMERULES.md §17). Cyan is the local player's.
 */

export const LOCAL_PLAYER_COLOR = 0x00e5ff;

/** Eight distinct hues for remote players (indexed by player.id % 8). */
export const PLAYER_COLORS = [
  0xff2bd6, // magenta
  0xb6ff3b, // lime
  0xff6b00, // orange
  0xffe14d, // yellow (cyan is reserved for the local player)
  0xff3b5c, // red
  0xffb300, // amber
  0x7c4dff, // violet
  0x39ff14, // neon green
];

export function playerColor(id: number, localId: number | null): number {
  return id === localId ? LOCAL_PLAYER_COLOR : PLAYER_COLORS[id % PLAYER_COLORS.length];
}

export function cssColor(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}
