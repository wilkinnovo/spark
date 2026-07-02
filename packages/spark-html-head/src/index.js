/**
 * spark-html-head — reactive document <title> and <meta> per route.
 *
 * Pairs with spark-html-router (or any pushState router): it hooks the History
 * API + popstate, so the title/meta update on every navigation with no wiring.
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
 *
 * Per-component metadata — the `head` store. A page component that already
 * holds the data (a CMS project, a blog post) sets its own metadata
 * reactively instead of the app pre-mapping every path in main.js:
 *
 *   const head = useStore('head');
 *   $: head.title = project ? `${project.name} · Novo` : 'Novo — 404';
 *   $: head.description = project?.description;
 *
 * `head.title` overrides the config title VERBATIM (titleTemplate is not
 * re-applied — the component has the final say); any other key is a <meta>
 * override/addition (`description`, `og:title`, …). Overrides are cleared on
 * every path change, so stale metadata never leaks into the next route.
 */
import { store, subscribe } from 'spark-html';

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

  // The reactive `head` store: components write per-route overrides here
  // (useStore('head')); the config above is the fallback. store() returns the
  // existing store if a component created it first (booted before head()).
  const headStore = store('head', {});
  let lastPath = null;
  let clearing = false; // the reset loop below writes the store — don't recurse

  function apply() {
    if (typeof document === 'undefined' || clearing) return;
    const path = currentPath(base);
    if (path !== lastPath) {
      // Route changed — drop the previous route's component overrides so its
      // title/description never leak into this one. The new route's component
      // re-writes the store when it boots, which re-runs apply().
      lastPath = path;
      clearing = true;
      for (const k of Object.keys(headStore)) headStore[k] = undefined;
      clearing = false;
    }
    // Title: a component override wins verbatim (no titleTemplate — the
    // component composes the final string); config titles keep the template.
    const storeTitle = headStore.title;
    if (storeTitle != null) {
      document.title = String(storeTitle);
    } else {
      let title = resolveTitle(path);
      if (title != null) {
        if (typeof options.titleTemplate === 'function') title = options.titleTemplate(title);
        document.title = title;
      }
    }
    // Meta: config first, store overrides win; store-only keys are additions.
    const meta = {};
    if (options.meta) {
      for (const [key, v] of Object.entries(options.meta)) {
        meta[key] = typeof v === 'function' ? v(path) : v;
      }
    }
    for (const [key, v] of Object.entries(headStore)) {
      if (key !== 'title' && v != null) meta[key] = v;
    }
    for (const [key, val] of Object.entries(meta)) {
      if (val != null) upsertMeta(key, String(val));
    }
  }

  installHistoryHook();
  listeners.add(apply);
  const unsubscribe = subscribe('head', apply); // component writes re-apply
  apply(); // set immediately for the initial route
  return () => { listeners.delete(apply); unsubscribe(); };
}

export default { head };
