import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

// Service worker is disabled while the app is served from the /app subpath:
// public/sw.js still precaches absolute "/" shell routes, which under /app would
// cache the marketing site and serve it for app routes. Re-enable once sw.js and
// manifest.webmanifest are made base-relative. Any previously installed worker is
// unregistered so it can't keep intercepting.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => regs.forEach((r) => r.unregister()))
    .catch(() => {
      // best effort — never block app load
    });
}
