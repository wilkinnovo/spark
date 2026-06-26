/**
 * spark-prerender — a friendly SEO interface for spark-html.
 *
 * Build-time prerender: make a client-rendered Spark page indexable by
 * crawlers with no rewrite, no SSR server, and no app-code changes.
 *
 * The one important idea (see spark-prerender-design.md §2): this is NOT a
 * second renderer. We set up a server DOM (linkedom) + the few globals the
 * runtime expects, run the REAL `mount()`, let the component tree settle,
 * then serialize `document`. One renderer, one source of truth, zero drift.
 */
import { readFile, access } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { parseHTML } from 'linkedom';

// A component request is a relative `*.html` (the runtime always appends
// `.html`); an absolute URL is a DATA request and is delegated elsewhere.
function isComponentRequest(reqPath) {
  const p = String(reqPath).split(/[?#]/)[0];
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(p)) return false; // http(s)://, etc.
  return p.endsWith('.html');
}

// Spark fetches a component as `fetch("components/x.html")`; on the server we
// read that from disk. Try each configured root; return its text, or null.
async function tryReadComponentFile(reqPath, roots) {
  let rel = String(reqPath).split(/[?#]/)[0].replace(/^\/+/, '');
  for (const root of roots) {
    const file = join(root, rel);
    try {
      await access(file);
      return await readFile(file, 'utf8');
    } catch {
      /* try the next root */
    }
  }
  return null;
}

// Run `fn` with `globalThis[k] = values[k]`, restoring the previous values
// after — so prerendering many pages in one process doesn't leak globals.
async function withGlobals(values, fn) {
  const keys = Object.keys(values);
  const prev = {};
  const had = {};
  for (const k of keys) { had[k] = k in globalThis; prev[k] = globalThis[k]; globalThis[k] = values[k]; }
  try {
    return await fn();
  } finally {
    for (const k of keys) { if (had[k]) globalThis[k] = prev[k]; else delete globalThis[k]; }
  }
}

// A microtask turn — lets queued patches (queueMicrotask(flush)) run.
const microtaskTurn = () => new Promise((r) => queueMicrotask(r));

// Default metadata convention: read these off component scopes, write them
// into <head>. `kind:'title'` → <title>; `name`/`property` → a <meta>.
const DEFAULT_META = [
  { var: 'pageTitle', kind: 'title' },
  { var: 'pageDescription', name: 'description' },
  { var: 'ogTitle', property: 'og:title' },
  { var: 'ogDescription', property: 'og:description' },
  { var: 'ogImage', property: 'og:image' },
];

function upsertMeta(document, attr, key, value) {
  let el = document.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

// Read designated vars off every booted component's scope (first defined
// wins, in DOM order) and inject them into <head>. No export, no special API.
function injectMetadata(document, metaMap) {
  const hosts = [...document.querySelectorAll('[name]')].filter((h) => h.__sparkScope);
  const read = (varName) => {
    for (const h of hosts) {
      let v;
      try { v = h.__sparkScope[varName]; } catch { v = undefined; }
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
  };
  for (const m of metaMap) {
    const value = read(m.var);
    if (value === undefined) continue;
    const str = String(value);
    if (m.kind === 'title') {
      let title = document.querySelector('title');
      if (!title) { title = document.createElement('title'); document.head.appendChild(title); }
      title.textContent = str;
    } else if (m.name) {
      upsertMeta(document, 'name', m.name, str);
    } else if (m.property) {
      upsertMeta(document, 'property', m.property, str);
    }
  }
}

function serialize(document) {
  let html = document.toString();
  if (!/^\s*<!doctype/i.test(html)) html = '<!DOCTYPE html>\n' + html;
  return html;
}

/**
 * Prerender a single entry HTML file to a fully-rendered HTML string.
 *
 * @param {string} entryPath  Path to the entry .html (e.g. dist/index.html).
 * @param {object} [options]
 * @param {string} [options.root]            Base dir for resolving components.
 *                                           Defaults to the entry file's dir.
 * @param {string[]} [options.componentRoots] Explicit dirs to resolve
 *                                           `import="components/x"` against.
 * @param {Array} [options.meta]             Metadata mapping (see DEFAULT_META).
 * @param {number} [options.maxPasses]       Settle-loop safety cap (default 100).
 * @param {Function} [options.fetch]         Fetch used for NON-component (data)
 *                                           requests a `load()` hook makes —
 *                                           point it at fixtures or a local API.
 *                                           Defaults to the real global fetch.
 * @returns {Promise<string>} the prerendered HTML.
 */
export async function prerender(entryPath, options = {}) {
  const entryAbs = resolve(entryPath);
  const baseRoot = options.root ? resolve(options.root) : dirname(entryAbs);
  const roots = (options.componentRoots || [
    baseRoot,
    join(baseRoot, 'public'),
    join(baseRoot, 'dist'),
    dirname(entryAbs),
  ]).filter((v, i, a) => a.indexOf(v) === i);
  const metaMap = options.meta || DEFAULT_META;
  const maxPasses = options.maxPasses ?? 100;
  // For data requests a load() hook makes (not component files).
  const dataFetch = options.fetch || globalThis.fetch;

  const source = await readFile(entryAbs, 'utf8');
  const { window, document } = parseHTML(source);
  // mount() awaits DOMContentLoaded only when readyState === 'loading'.
  try { if (document.readyState === 'loading') document.readyState = 'complete'; } catch { /* read-only is fine */ }

  // ── Drainable rAF: bootComponent defers its reveal + onMount here. We run
  //    these synchronously between settle passes instead of on a frame timer.
  let rafQueue = [];
  const requestAnimationFrame = (fn) => rafQueue.push(fn);
  const drainRaf = () => {
    const q = rafQueue; rafQueue = [];
    for (const fn of q) { try { fn(); } catch (e) { console.warn('[spark-prerender] rAF callback threw:', e.message); } }
    return q.length;
  };

  // ── fetch override. Component imports (relative *.html) are read from disk;
  //    anything else is a DATA request (from a load() hook) and is delegated
  //    to options.fetch / the real fetch. In-flight reads are tracked so the
  //    settle loop knows when work has drained.
  const pending = new Set();
  const fetch = (reqPath, init) => {
    const p = (async () => {
      if (isComponentRequest(reqPath)) {
        const text = await tryReadComponentFile(reqPath, roots);
        return text != null
          ? { ok: true, status: 200, text: async () => text }
          : { ok: false, status: 404, text: async () => '' };
      }
      if (typeof dataFetch !== 'function') return { ok: false, status: 404, text: async () => '' };
      return dataFetch(reqPath, init);
    })();
    pending.add(p);
    p.finally(() => pending.delete(p));
    return p;
  };

  return withGlobals(
    { window, document, Node: window.Node, requestAnimationFrame, fetch },
    async () => {
      // Import the runtime FRESH per page (cache-busted) so its module-load
      // cloak + caches bind to THIS document, and pages stay isolated.
      const url = import.meta.resolve('spark-html');
      const spark = await import(url + '?prerender=' + Math.random().toString(36).slice(2));

      // ── Settle loop (design §5): the tree expands in waves — rAF reveals,
      //    and imports inside each/if resolve asynchronously, fetching more
      //    children. Loop until a full pass does no work.
      const settle = async () => {
        for (let pass = 0; pass < maxPasses; pass++) {
          const drained = drainRaf();
          if (pending.size) await Promise.all([...pending]);
          await microtaskTurn();
          await microtaskTurn();
          if (drained === 0 && pending.size === 0 && rafQueue.length === 0) break;
        }
      };

      await spark.mount(document.body);
      await settle();

      // ── Phase 2: awaitable data hook. A component may declare an async
      //    `load()` that fetches API data and assigns it to state. We call
      //    every load() (data fetches go through the delegate above), await
      //    them, then re-settle so the loaded content renders into the HTML.
      //    Phase 1 is unchanged — components without load() never run extra
      //    work, and load() is a plain function, not a special API.
      const loaders = [];
      for (const host of document.querySelectorAll('[name]')) {
        const fn = host.__sparkScope && host.__sparkScope.load;
        if (typeof fn === 'function') loaders.push(fn);
      }
      if (loaders.length) {
        await Promise.all(
          loaders.map(async (fn) => {
            try { await fn(); } catch (e) { console.warn('[spark-prerender] load() threw:', e.message); }
          }),
        );
        await settle();
      }

      injectMetadata(document, metaMap);
      return serialize(document);
    },
  );
}

export default { prerender };
