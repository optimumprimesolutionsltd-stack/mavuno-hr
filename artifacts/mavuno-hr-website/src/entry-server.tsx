import { renderToString } from 'react-dom/server';
import App from './App';

export { SITE_ROUTES, SITE_ORIGIN } from './site-routes';

/**
 * Build-time only. prerender.mjs calls this once per route and drops the result
 * into the <div id="root"> of the client build's index.html, so each URL ships
 * real HTML instead of an empty shell.
 */
export function render(path: string): string {
  return renderToString(<App ssrPath={path} />);
}
