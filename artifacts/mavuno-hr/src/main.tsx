import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

// Service worker: lets staff install the app on their phones. sw.js is now
// relative to its own scope (BASE_URL, i.e. /app/) and never caches pay data.
// Any worker left over at another scope (the old root-scoped one cached the
// marketing site) is unregistered first.
if ('serviceWorker' in navigator) {
  const base = import.meta.env.BASE_URL;
  const scope = new URL(base, window.location.origin).href;
  navigator.serviceWorker.getRegistrations()
    .then((regs) => Promise.all(regs.filter((r) => r.scope !== scope).map((r) => r.unregister())))
    .then(() => navigator.serviceWorker.register(`${base}sw.js`, { scope: base }))
    .catch(() => {
      // best effort — never block app load
    });
}

// Chrome/Android offers installing via this event, which fires early -- keep
// it so the portal's "Install on your phone" button can use it later.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as any).__mavunoInstallPrompt = e;
  window.dispatchEvent(new Event('mavuno-install-ready'));
});
