import React from 'react';
import ReactDOM from 'react-dom/client';

import './styles/global.css';
import { App } from './ui/App.js';
import { applyTouchClass } from './ui/touch.js';

applyTouchClass();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
