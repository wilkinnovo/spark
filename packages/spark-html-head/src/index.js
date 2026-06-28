/**
 * spark-html-head — reactive document <title> and <meta> per route.
 *
 * Pairs with spark-html-router (or any pushState router): it hooks the History
 * API + popstate, so the title/meta update on every navigation with no wiring.
 * Zero dependencies — it only touches `document` and `history`.
 *
 *   import { head } from 'spark-html-head';
 *
 *   head({
 *     title: { '/': 'Home', '/about': 'About', '*': 'Not found' },
 *     titleTemplate: (t) => `${t} · My Site`,
 *     meta: { description: (path) => `The ${path} page` },
 *     base: '/spark',           // optional, stripped before matching
 *   });
 *
 * `title` may be a string, a `(path) => string`, or a `{ path: title }` map
 * (with an optional `'*'` fallback). Returns a function to stop updating.
 */

let installed = false;
const listeners = new Set();

function installHistoryHook() {
  if (installed || typeof history === 'undefined') return;
  installed = true;
  const fire = () => { for (const fn of listeners) fn(); };
  for (const m of ['pushState', 'replaceState']) {
    const orig = history[m];
    if (typeof orig !== 'function') continue;
    history[m] = function (...args) {
      const r = orig.apply(this, args);
      fire();
      return r;
    };
  }
  if (typeof addEventListener !== 'undefined') addEventListener('popstate', fire);
}

function normalize(pathname, base) {
  let p = String(pathname || '/');
  if (base && p.startsWith(base)) p = p.slice(base.length);
  if (!p.startsWith('/')) p = '/' + p;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p || '/';
}

function currentPath(base) {
  return normalize((typeof location !== 'undefined' && location.pathname) || '/', base);
}

// name="description" → <meta name>; anything with a colon (og:title) → property.
function upsertMeta(key, content) {
  const attr = key.includes(':') ? 'property' : 'name';
  let el = document.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/**
 * Keep <title>/<meta> in sync with the route. Returns a stop() function.
 * @param {object} [options]
 * @param {string|Function|Record<string,string>} [options.title]
 * @param {(title: string) => string} [options.titleTemplate]
 * @param {Record<string, string | ((path: string) => string)>} [options.meta]
 * @param {string} [options.base]
 */
export function head(options = {}) {
  const base = (options.base || '').replace(/\/$/, '');

  const resolveTitle = (path) => {
    const t = options.title;
    if (typeof t === 'function') return t(path);
    if (t && typeof t === 'object') return (path in t) ? t[path] : t['*'];
    return t; // string | undefined
  };

  function apply() {
    if (typeof document === 'undefined') return;
    const path = currentPath(base);
    let title = resolveTitle(path);
    if (title != null) {
      if (typeof options.titleTemplate === 'function') title = options.titleTemplate(title);
      document.title = title;
    }
    if (options.meta) {
      for (const [key, v] of Object.entries(options.meta)) {
        const val = typeof v === 'function' ? v(path) : v;
        if (val != null) upsertMeta(key, String(val));
      }
    }
  }

  installHistoryHook();
  listeners.add(apply);
  apply(); // set immediately for the initial route
  return () => listeners.delete(apply);
}

export default { head };
