/**
 * dev.ts — developer tools are shown only under `npm run demo`, which sets
 * VITE_NOBU_DEV=1 for the client and NOBU_DEV=1 for the server (the server
 * ignores developer messages without it). See README "Developer toggle".
 */

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;

export const DEV_TOOLS = env?.VITE_NOBU_DEV === '1';
