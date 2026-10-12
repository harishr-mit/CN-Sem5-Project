/**
 * codes.ts — private room codes (docs/PHASE7_PLAN.md D9): an adjective and an
 * animal, short words that are easy to say across a room. Canonical form
 * `blue-fox`; shown as `BLUE FOX`; typed in any case with a space, a dash or
 * nothing between the words (`bluefox`).
 *
 * The lists are chosen so that a code without a separator splits only one
 * way (tests/rooms.test.ts checks every pair).
 */

export const ADJECTIVES: readonly string[] = [
  'red', 'blue', 'gold', 'pink', 'jade', 'teal', 'mint', 'ruby', 'lime', 'navy',
  'bold', 'calm', 'cool', 'fast', 'keen', 'kind', 'loud', 'neat', 'wild', 'wise',
  'brave', 'happy', 'quick', 'quiet', 'shy', 'tiny', 'warm', 'zany', 'epic', 'lazy',
  'lucky', 'sunny', 'silly', 'snowy', 'rusty', 'misty', 'dusty', 'fuzzy', 'funky', 'jolly',
];

export const ANIMALS: readonly string[] = [
  'fox', 'owl', 'cat', 'dog', 'yak', 'elk', 'emu', 'bat', 'bee', 'cow',
  'eel', 'hen', 'pig', 'ram', 'ape', 'bear', 'crab', 'crow', 'deer', 'duck',
  'frog', 'goat', 'hawk', 'lion', 'lynx', 'mole', 'moth', 'mule', 'newt', 'puma',
  'seal', 'swan', 'toad', 'wolf', 'wren', 'zebra', 'tiger', 'panda', 'otter', 'koala',
];

const ADJ = new Set(ADJECTIVES);
const ANI = new Set(ANIMALS);

/** Every possible code (1 600): adjective × animal. */
export const CODE_COUNT = ADJECTIVES.length * ANIMALS.length;

/** `blue-fox` from what someone typed (`Blue Fox`, `BLUE-FOX`, `bluefox`); null if it is not a code. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 40) return null;
  const words = input.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (words.length === 2) return ADJ.has(words[0]) && ANI.has(words[1]) ? `${words[0]}-${words[1]}` : null;
  if (words.length !== 1) return null;
  const w = words[0];
  for (let i = 3; i <= w.length - 3; i++) {
    const a = w.slice(0, i), b = w.slice(i);
    if (ADJ.has(a) && ANI.has(b)) return `${a}-${b}`;
  }
  return null;
}

/** `BLUE FOX` for display. */
export function formatCode(code: string): string {
  return code.replace('-', ' ').toUpperCase();
}

/** A code not in `taken`, picked with `rand` (0 ≤ rand() < 1); null when all are taken. */
export function newCode(taken: ReadonlySet<string>, rand: () => number = Math.random): string | null {
  if (taken.size >= CODE_COUNT) return null;
  for (let tries = 0; tries < 64; tries++) {
    const a = ADJECTIVES[Math.floor(rand() * ADJECTIVES.length)];
    const b = ANIMALS[Math.floor(rand() * ANIMALS.length)];
    const code = `${a}-${b}`;
    if (!taken.has(code)) return code;
  }
  for (const a of ADJECTIVES) for (const b of ANIMALS) if (!taken.has(`${a}-${b}`)) return `${a}-${b}`;
  return null;
}
