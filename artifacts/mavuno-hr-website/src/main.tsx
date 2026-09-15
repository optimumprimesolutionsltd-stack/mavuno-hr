import { createRoot, hydrateRoot } from 'react-dom/client';

import App from './App';

import './index.css';

const container = document.getElementById('root')!;

// In production the container already holds prerendered markup, so hydrate it
// rather than throwing it away and re-rendering — otherwise the prerender only
// helps crawlers and costs real users a blank first paint. The dev server
// serves an empty root, hence the branch.
//
// firstElementChild, not firstChild: index.html ships
// `<div id="root"><!--app-html--></div>`, and that comment is a child node. The
// dev server therefore took the hydrate branch against a container holding
// nothing but a comment, and every page load opened with a hydration-mismatch
// overlay covering the site.
if (container.firstElementChild) {
  hydrateRoot(container, <App />);
} else {
  createRoot(container).render(<App />);
}
