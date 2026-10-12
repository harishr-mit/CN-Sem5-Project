/**
 * main.tsx — entry of the game edition (`npm run dev` / `npm run build`,
 * docs/PHASE7_PLAN.md D1). It lives in client/play, the root of
 * vite.play.config.ts, so the dev server finds it; the code is in src/.
 * Imports only what a player needs; the demo's entry is src/main.tsx.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';

import '../src/styles/global.css';
import { PlayApp } from '../src/play/PlayApp.js';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PlayApp />
  </React.StrictMode>
);
