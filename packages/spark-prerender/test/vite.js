/**
 * spark-prerender/vite plugin — prerenders dist/*.html in `closeBundle`.
 * We simulate a built `dist/` by copying the fixture, then drive the plugin
 * hooks directly (no real Vite needed).
 */
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, cpSync, readFileSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import sparkPrerender from '../src/vite.js';

const here = dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); }
}

console.log('\nspark-prerender/vite');

// Simulate dist/ by copying the fixture site into a temp out dir.
const dist = mkdtempSync(join(tmpdir(), 'spark-dist-'));
cpSync(join(here, 'fixture'), dist, { recursive: true });

await test('plugin shape: build-only, named, with closeBundle', () => {
  const p = sparkPrerender();
  assert.equal(p.name, 'spark-prerender');
  assert.equal(p.apply, 'build');
  assert.equal(typeof p.closeBundle, 'function');
});

await test('closeBundle prerenders the listed pages in place', async () => {
  const p = sparkPrerender({ pages: ['index.html'] });
  p.configResolved({ build: { outDir: dist } });
  await p.closeBundle();

  const out = readFileSync(join(dist, 'index.html'), 'utf8');
  assert.ok(out.includes('My Tasks'), 'interpolation rendered');
  assert.ok(out.includes('Write parser — done'), 'each rendered');
  assert.ok(out.includes('<title>Sparksplash — prerendered</title>'), 'metadata injected');
});

await test('a missing page is skipped without throwing', async () => {
  const p = sparkPrerender({ pages: ['does-not-exist.html'] });
  p.configResolved({ build: { outDir: dist } });
  await assert.doesNotReject(() => p.closeBundle());
});

await test('routed entry: each route file is isolated (no home leak)', async () => {
  // A <template route> entry as index.html — the "/" output IS this file, so a
  // naive in-loop write would clobber it and leak the home route into the rest.
  const proot = mkdtempSync(join(tmpdir(), 'spark-routed-'));
  const rdist = join(proot, 'dist');
  cpSync(join(here, 'fixture'), rdist, { recursive: true });
  copyFileSync(join(here, 'fixture', 'routed.html'), join(rdist, 'index.html'));

  const p = sparkPrerender({ pages: ['index.html'] });
  p.configResolved({ root: proot, build: { outDir: rdist } });
  await p.closeBundle();

  const about = readFileSync(join(rdist, 'about.html'), 'utf8');
  assert.ok(about.includes('about page'), 'about.html has its own content');
  assert.ok(!about.includes('home page'), 'about.html must NOT leak the home route');
  assert.equal((about.match(/data-spark-route=/g) || []).length, 1, 'exactly one outlet');

  const index = readFileSync(join(rdist, 'index.html'), 'utf8');
  assert.ok(index.includes('home page'), 'index.html has the home route');
  assert.ok(!index.includes('about page'), 'index.html must NOT leak the about route');

  // _redirects ships in the output dir; vercel.json must land at the project
  // root (Vercel ignores it under dist/).
  assert.ok(existsSync(join(rdist, '_redirects')), '_redirects in the output dir');
  assert.ok(existsSync(join(proot, 'vercel.json')), 'vercel.json at the project root');
  assert.ok(!existsSync(join(rdist, 'vercel.json')), 'vercel.json must NOT be in dist/');
});

await test('routed entry: 404.html is generated from the catch-all automatically', async () => {
  const proot = mkdtempSync(join(tmpdir(), 'spark-404-'));
  const rdist = join(proot, 'dist');
  cpSync(join(here, 'fixture'), rdist, { recursive: true });
  copyFileSync(join(here, 'fixture', 'routed.html'), join(rdist, 'index.html'));

  const p = sparkPrerender({ pages: ['index.html'] });
  p.configResolved({ root: proot, build: { outDir: rdist } });
  await p.closeBundle();

  assert.ok(existsSync(join(rdist, '404.html')), '404.html emitted without manual wiring');
  const nf = readFileSync(join(rdist, '404.html'), 'utf8');
  assert.ok(nf.includes('404 Not Found page'), "the user's route=\"*\" content is used");
  assert.ok(!nf.includes('home page'), 'no route content leaked into 404.html');
});

await test('routed entry without a catch-all: 404.html uses the built-in default', async () => {
  const proot = mkdtempSync(join(tmpdir(), 'spark-404d-'));
  const rdist = join(proot, 'dist');
  cpSync(join(here, 'fixture'), rdist, { recursive: true });
  copyFileSync(join(here, 'fixture', 'routed-no404.html'), join(rdist, 'index.html'));

  const p = sparkPrerender({ pages: ['index.html'] });
  p.configResolved({ root: proot, build: { outDir: rdist } });
  await p.closeBundle();

  const nf = readFileSync(join(rdist, '404.html'), 'utf8');
  assert.ok(nf.includes('data-spark-404'), 'built-in default 404 baked');
  assert.ok(nf.includes('Page not found'), 'default copy present');
});

await test('a user-provided 404.html is never overwritten', async () => {
  const proot = mkdtempSync(join(tmpdir(), 'spark-404u-'));
  const rdist = join(proot, 'dist');
  cpSync(join(here, 'fixture'), rdist, { recursive: true });
  copyFileSync(join(here, 'fixture', 'routed.html'), join(rdist, 'index.html'));
  writeFileSync(join(rdist, '404.html'), '<!doctype html><h1>my very own 404</h1>\n', 'utf8');

  const p = sparkPrerender({ pages: ['index.html'] });
  p.configResolved({ root: proot, build: { outDir: rdist } });
  await p.closeBundle();

  const nf = readFileSync(join(rdist, '404.html'), 'utf8');
  assert.ok(nf.includes('my very own 404'), "the user's 404.html survives the build untouched");
});

await test('site option: sitemap.xml + robots.txt emitted, noindex respected', async () => {
  const proot = mkdtempSync(join(tmpdir(), 'spark-seo-'));
  const rdist = join(proot, 'dist');
  cpSync(join(here, 'fixture'), rdist, { recursive: true });
  copyFileSync(join(here, 'fixture', 'routed-seo.html'), join(rdist, 'index.html'));

  const p = sparkPrerender({
    pages: ['index.html'],
    site: 'https://example.com',
    extraRoutes: () => ['/projects/alpha', '/projects/beta'],
  });
  p.configResolved({ root: proot, build: { outDir: rdist } });
  await p.closeBundle();

  const sitemap = readFileSync(join(rdist, 'sitemap.xml'), 'utf8');
  assert.ok(sitemap.includes('<loc>https://example.com/</loc>'), 'root in sitemap');
  assert.ok(sitemap.includes('<loc>https://example.com/about</loc>'), 'route in sitemap');
  assert.ok(sitemap.includes('<loc>https://example.com/projects/alpha</loc>'), 'extraRoutes (dynamic data) included');
  assert.ok(!sitemap.includes('/admin'), 'noindex route excluded from sitemap');

  const robots = readFileSync(join(rdist, 'robots.txt'), 'utf8');
  assert.ok(robots.includes('Disallow: /admin'), 'noindex disallowed');
  assert.ok(robots.includes('Sitemap: https://example.com/sitemap.xml'), 'sitemap referenced');

  const admin = readFileSync(join(rdist, 'admin.html'), 'utf8');
  assert.ok(admin.includes('content="noindex"'), 'noindex meta baked into the page');
});

await test('no site option: robots.txt still emitted (no Sitemap line), no sitemap.xml', async () => {
  const proot = mkdtempSync(join(tmpdir(), 'spark-seo0-'));
  const rdist = join(proot, 'dist');
  cpSync(join(here, 'fixture'), rdist, { recursive: true });
  copyFileSync(join(here, 'fixture', 'routed.html'), join(rdist, 'index.html'));

  const p = sparkPrerender({ pages: ['index.html'] });
  p.configResolved({ root: proot, build: { outDir: rdist } });
  await p.closeBundle();

  assert.ok(!existsSync(join(rdist, 'sitemap.xml')), 'sitemap needs a site origin');
  const robots = readFileSync(join(rdist, 'robots.txt'), 'utf8');
  assert.ok(robots.includes('Allow: /'), 'zero-config robots.txt');
  assert.ok(!robots.includes('Sitemap:'), 'no sitemap reference without site');
});

await test('user-shipped sitemap.xml / robots.txt are never overwritten', async () => {
  const proot = mkdtempSync(join(tmpdir(), 'spark-seou-'));
  const rdist = join(proot, 'dist');
  cpSync(join(here, 'fixture'), rdist, { recursive: true });
  copyFileSync(join(here, 'fixture', 'routed.html'), join(rdist, 'index.html'));
  writeFileSync(join(rdist, 'sitemap.xml'), '<my-sitemap/>', 'utf8');
  writeFileSync(join(rdist, 'robots.txt'), '# my rules\n', 'utf8');

  const p = sparkPrerender({ pages: ['index.html'], site: 'https://example.com' });
  p.configResolved({ root: proot, build: { outDir: rdist } });
  await p.closeBundle();

  assert.equal(readFileSync(join(rdist, 'sitemap.xml'), 'utf8'), '<my-sitemap/>');
  assert.equal(readFileSync(join(rdist, 'robots.txt'), 'utf8'), '# my rules\n');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
