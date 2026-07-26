import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/global.css';

/* Personal ranking overlays were retired. Anyone who saved one before the
   change still has it in local storage, and leaving it there would let a
   returning user be priced against their own stale numbers with no UI left
   to see or clear it. Drop it on boot. The Supabase table and any
   server-side handling are untouched and are Franco's call. */
try {
  window.localStorage.removeItem('og.olympus.model-overlay');
} catch {
  // storage unavailable; nothing to clear
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
