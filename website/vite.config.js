import { defineConfig } from 'vite';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build as esbuild } from 'esbuild';
import spark from 'spark-html/vite';
import prerender from 'spark-prerender/vite';

// Compute the hero stats from the live source — so they NEVER go stale. Vite
// runs from website/, so the repo root is one level up.
let _statsCache;
async function computeStats() {
  if (_statsCache) return _statsCache;
  const ROOT = resolve('..');
  // runtime: gzip of the minified runtime — the same metric as size-check.
  const out = await esbuild({
    entryPoints: [resolve(ROOT, 'packages/spark/src/index.js')],
    bundle: true, minify: true, write: false, format: 'esm',
  });
  const runtimeKb = Math.round(gzipSync(out.outputFiles[0].contents).length / 1024);
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'packages/spark/package.json'), 'utf8'));
  const deps = Object.keys(pkg.dependencies || {}).length;
  const pkgDirs = readdirSync(resolve(ROOT, 'packages'))
    .filter((d) => existsSync(resolve(ROOT, 'packages', d, 'package.json')));
  // tests: count assertions (`assert(` / `assert.method(`) across every test
  // dir — captures all files, including those with a custom harness. Floored to
  // a tens boundary so the "N+ tests" claim is always honest, never overstated.
  let tests = 0;
  for (const d of pkgDirs) {
    const tdir = resolve(ROOT, 'packages', d, 'test');
    if (!existsSync(tdir)) continue;
    for (const f of readdirSync(tdir)) {
      if (f.endsWith('.js')) tests += (readFileSync(resolve(tdir, f), 'utf8').match(/\bassert(\.\w+)?\(/g) || []).length;
    }
  }
  _statsCache = { build: 0, runtimeKb, deps, packages: pkgDirs.length, tests: Math.floor(tests / 10) * 10 };
  return _statsCache;
}

// Expose stats two ways:
//  • `virtual:spark-stats` — imported by main.js → seeds a `stats` store (dev).
//  • a closeBundle pass that BAKES the numbers into the built home.html, so
//    prerender (which runs mount() but not main.js) emits them into the static
//    HTML too. Both paths read the same computed values.
function sparkStats() {
  const VID = 'virtual:spark-stats';
  return {
    name: 'spark-stats',
    resolveId(id) { if (id === VID) return '\0' + VID; },
    async load(id) {
      if (id === '\0' + VID) return `export default ${JSON.stringify(await computeStats())};`;
    },
    closeBundle: {
      order: 'pre', // run before spark-prerender reads the built components
      async handler() {
        const file = resolve('dist/components/home.html');
        if (!existsSync(file)) return;
        const stats = await computeStats();
        let html = readFileSync(file, 'utf8');
        for (const [k, v] of Object.entries(stats)) html = html.replaceAll(`{stats.${k}}`, String(v));
        writeFileSync(file, html);
      },
    },
  };
}

// At build time, resolve the home's URL-imported demo component from the LOCAL
// copy instead of hitting the CDN — so prerender bakes it with no network
// dependency. In the browser it's fetched live, cross-origin, from the CDN.
function prerenderFetch(url) {
  if (typeof url === 'string' && url.includes('/components/url-card.html')) {
    const text = readFileSync(resolve('public/components/url-card.html'), 'utf8');
    return Promise.resolve({ ok: true, status: 200, text: async () => text });
  }
  return Promise.resolve({ ok: false, status: 404, text: async () => '' });
}

// On GitHub Pages the site is served from /<repo>/, not /. The deploy workflow
// sets BASE_PATH; locally it defaults to '/'.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  // spark() serves components in dev; prerender() auto-detects the
  // <template route> blocks and emits one fully-rendered HTML file per route,
  // plus 404.html — GitHub Pages serves it for unknown paths, and since the
  // full app shell + router ship in it, deep links still resolve client-side
  // (this replaced the old spa404() copy-index.html workaround) — plus
  // sitemap.xml + robots.txt (site = the GitHub Pages origin + base).
  plugins: [sparkStats(), spark(), prerender({
    site: 'https://wilkinnovo.github.io' + (base === '/' ? '' : base.replace(/\/$/, '')),
    prerender: { fetch: prerenderFetch },
  })],
});
