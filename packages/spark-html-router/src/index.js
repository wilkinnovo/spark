/**
 * spark-html-router — declarative client routing for spark-html.
 *
 * Author routes as inert <template route> blocks (the runtime never descends
 * into <template> content, so they're invisible to mount()), then call
 * router() once. It:
 *
 *   • mounts the page (chrome + the active route) a SINGLE time — no flash,
 *     no double-boot, onMount fires exactly once per component;
 *   • adopts a prerendered route outlet in place (spark-prerender bakes the
 *     active route as <div data-spark-route> — the runtime hydrates over it);
 *   • intercepts same-origin <a> clicks for SPA navigation and tracks
 *     Back/Forward;
 *   • exposes a reactive `route` store ({ path }) so nav links, titles, and
 *     analytics can react to the current route with `useStore('route')`.
 *
 *   <template route="/">       <div import="components/home"></div>   </template>
 *   <template route="/about">  <div import="components/about"></div>  </template>
 *   <template route="*">       <div import="components/not-found"></div></template>
 *
 *   import { router } from 'spark-html-router';
 *   router();                       // that's it
 *
 *   // anywhere, to highlight the active link:
 *   const route = useStore('route');
 *   $: active = route.path === '/about';
 */
import { mount, unmount, store } from 'spark-html';

let base = '';
let rootEl = null;
let active = null;     // the live outlet element for the current route
let routeProxy = null; // the reactive `route` store proxy
let started = false;

// Normalize a pathname to a base-stripped, no-trailing-slash route key.
function normalize(pathname) {
  let p = String(pathname || '/');
  if (base && p.startsWith(base)) p = p.slice(base.length);
  if (!p.startsWith('/')) p = '/' + p;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p || '/';
}

function currentPath() {
  return normalize((typeof location !== 'undefined' && location.pathname) || '/');
}

// Publish the active path to the reactive `route` store so any component can
// `useStore('route')` and react (nav highlight, document.title, analytics…).
// Created here BEFORE the first mount so components find it on boot.
function setRoute(path) {
  if (!routeProxy) routeProxy = store('route', { path });
  routeProxy.path = path;
}

// Reflect the active route onto same-origin <a> links: set aria-current="page"
// on links whose href matches the current path, clear it on the rest. Lets a
// nav highlight the active link with pure CSS — `a[aria-current="page"]` — and
// no per-link `useStore('route')` wiring. Runs after each render.
function markActiveLinks() {
  if (!rootEl || !rootEl.querySelectorAll) return;
  const path = currentPath();
  for (const a of rootEl.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    let match = false;
    if (href && !/^[a-z]+:/i.test(href) && !href.startsWith('#')) {
      try {
        const u = new URL(href, location.href);
        if (u.origin === location.origin) match = normalize(u.pathname) === path;
      } catch { /* malformed href — not active */ }
    }
    if (match) a.setAttribute('aria-current', 'page');
    else if (a.getAttribute('aria-current') === 'page') a.removeAttribute('aria-current');
  }
}

// Find the <template route> that matches `path`: exact match first, then a
// `route="*"` catch-all (404) if present.
function matchTemplate(path) {
  const templates = [...rootEl.querySelectorAll('template[route]')];
  let fallback = null;
  for (const t of templates) {
    const r = t.getAttribute('route');
    if (r === '*') { fallback = t; continue; }
    if (normalize(r) === path) return t;
  }
  return fallback;
}

// Clone the matching <template route> into a fresh outlet element and insert
// it after the template. The caller mounts it. Returns the outlet, or null
// when there's no matching route and no catch-all.
function buildOutlet(path) {
  const t = matchTemplate(path);
  if (!t) return null;
  const outlet = document.createElement('div');
  outlet.setAttribute('data-spark-route', path);
  // Clone the template's children in (appendChild of a DocumentFragment is
  // unreliable across DOM impls, so copy node by node).
  for (const child of [...t.content.childNodes]) outlet.appendChild(child.cloneNode(true));
  t.after(outlet);
  return outlet;
}

// Initial render, folded INTO the single mount(). If the page was prerendered
// the active route is already baked as <div data-spark-route> — adopt it in
// place so mount() hydrates over it (no flash, no clone, no second mount).
// Otherwise clone the matching template into an outlet. Either way the one
// mount(rootEl) that follows resolves its imports and boots it once.
function prepareInitial() {
  const path = currentPath();
  setRoute(path);
  const baked = rootEl.querySelector('[data-spark-route]');
  if (baked) {
    if (normalize(baked.getAttribute('data-spark-route')) === path) {
      active = baked;            // prerendered outlet matches the URL — adopt
      return;
    }
    baked.remove();              // stale outlet (shouldn't happen) — rebuild
  }
  active = buildOutlet(path);     // no prerendered outlet (dev / SPA-only)
}

// SPA navigation render: swap the active outlet for the route matching the URL.
// The new outlet is mounted BEFORE the old one is torn down, so there's no
// blank frame between routes, and onMount fires once for the new route.
async function render() {
  const path = currentPath();
  if (active && normalize(active.getAttribute('data-spark-route')) === path) {
    setRoute(path);
    markActiveLinks();
    return; // already showing this route
  }

  const old = active;
  const outlet = buildOutlet(path);
  active = outlet;
  setRoute(path);

  // `quiet` so SPA navigation doesn't reprint the "⚡ ready" banner on every
  // route change — the initial mount() below already logged the app boot once.
  if (outlet) await mount(outlet, { quiet: true });  // resolve imports + boot — exactly once

  if (old && old !== outlet) {
    unmount(old);
    old.remove();
  }
  markActiveLinks();
}

// Navigate to a route programmatically (path is route-relative; base is added).
export function navigate(to) {
  const url = base + normalize(to);
  if (typeof history !== 'undefined') history.pushState({}, '', url);
  return render();
}

function onClick(e) {
  if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  let el = e.target;
  while (el && el.tagName !== 'A') el = el.parentNode;
  if (!el) return;
  const href = el.getAttribute('href');
  const target = el.getAttribute('target');
  if (!href || (target && target !== '_self') || el.hasAttribute('download') || /^[a-z]+:/i.test(href)) {
    return; // external scheme, new tab, or download — let the browser handle it
  }
  const url = new URL(href, location.href);
  if (url.origin !== location.origin) return;
  e.preventDefault();
  history.pushState({}, '', url.pathname + url.search + url.hash);
  render();
}

/**
 * Start the router: mount the page (chrome + active route, once) and show the
 * route matching the URL, intercept same-origin <a> clicks for SPA navigation,
 * and track Back/Forward. Call it once instead of mount().
 *
 * @param {object} [options]
 * @param {string} [options.base]  Path prefix the app is served under (e.g.
 *                                 "/spark" on GitHub Pages). Stripped before
 *                                 matching; added back when navigating.
 * @param {string|Element} [options.root]  Mount root (default document.body).
 * @returns {Promise<void>}
 */
export async function router(options = {}) {
  if (started) return;
  started = true;
  base = options.base || '';
  if (base.length > 1 && base.endsWith('/')) base = base.slice(0, -1);
  rootEl = typeof options.root === 'string'
    ? document.querySelector(options.root)
    : options.root || document.body;

  if (typeof document !== 'undefined') document.addEventListener('click', onClick);
  if (typeof window !== 'undefined') window.addEventListener('popstate', () => render());

  prepareInitial();      // put the active route's outlet in the DOM (adopt/clone)
  await mount(rootEl);   // ONE mount: chrome + the active route, booted once
  markActiveLinks();     // highlight the matching <a> (aria-current="page")
}

export default { router, navigate };
