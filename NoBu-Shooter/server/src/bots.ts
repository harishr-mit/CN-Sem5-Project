/**
 * bots.ts — the server's bots (GAMERULES.md §12).
 * The decision code lives in shared/src/sim/botBrain.ts (docs/PHASE5_PLAN.md
 * D10) so network players (`npm run swarm`) use the same AI. Server bots'
 * traffic is server-local and bypasses the network emulator.
 */

export { BotController, type BotView } from '@nobu/shared/sim/botBrain.js';
