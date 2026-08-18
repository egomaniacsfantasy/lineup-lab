import { Capacitor } from '@capacitor/core';
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

/* Belt and braces for the focus zoom.

   A 16px floor on every text field is the fix, but it only holds for as long as
   nobody adds a 13px input, and the failure is silent and total: one tap and
   the whole shell is bigger than the screen for the rest of the session. In the
   native app there is no reason to allow a page scale other than 1 — pinch is
   already disabled in MainViewController — so say so in the viewport too.

   Native only. On the web, pinch-to-zoom is an accessibility feature and
   locking it would be taking something away from people who need it. */
if (Capacitor.isNativePlatform()) {
  const viewport = document.querySelector('meta[name="viewport"]');
  viewport?.setAttribute(
    'content',
    'width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover',
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
