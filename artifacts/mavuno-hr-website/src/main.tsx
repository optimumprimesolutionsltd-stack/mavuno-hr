import { createRoot, hydrateRoot } from 'react-dom/client';

import App from './App';

import './index.css';

const container = document.getElementById('root')!;

// In production the container already holds prerendered markup, so hydrate it
// rather than throwing it away and re-rendering — otherwise the prerender only
// helps crawlers and costs real users a blank first paint. The dev server
// serves an empty root, hence the branch.
if (container.firstChild) {
  hydrateRoot(container, <App />);
} else {
  createRoot(container).render(<App />);
}
