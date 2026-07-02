/**
 * Route prerendering: enumerate <template route>, render one HTML per route
 * (with the route active + adoptable), and emit deploy rewrites.
 */
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { prerender, routesOf, routeToFile, redirectsFor, vercelConfigFor, NOT_FOUND_ROUTE, noindexRoutesOf, sitemapFor, robotsFor } from '../src/prerender.js';

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, 'fixture', 'routed.html');
const source = readFileSync(entry, 'utf8');

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); }
}

console.log('\nspark-prerender — routes');

await test('routesOf() finds the concrete routes (catch-all excluded)', () => {
  assert.deepEqual(routesOf(source), ['/', '/about', '/projects']);
});

await test('routesOf() skips dynamic (:param) routes', () => {
  const html = '<body>' +
    '<template route="/"><div import="components/home-pg"></div></template>' +
    '<template route="/blog/:id"><div import="components/about-pg"></div></template>' +
    '<template route="*"><div import="components/missing"></div></template>' +
    '</body>';
  assert.deepEqual(routesOf(html), ['/'], 'dynamic + catch-all excluded');
});

await test('routeToFile() maps routes to static files', () => {
  assert.equal(routeToFile('/'), 'index.html');
  assert.equal(routeToFile('/about'), 'about.html');
  assert.equal(routeToFile('/a/b'), 'a/b.html');
});

await test('prerendering a route bakes its content + an adoptable marker', async () => {
  const about = await prerender(entry, { route: '/about' });
  assert.ok(about.includes('about page'), 'about content rendered');
  assert.ok(/data-spark-route="\/about"/.test(about), 'adoptable outlet marker present');
  assert.ok(!about.includes('home page'), 'other routes not rendered');
  assert.ok(about.includes('About</a>'), 'chrome (nav) still rendered');
});

await test('isolates other routes: one outlet, untouched <template> blocks', async () => {
  const about = await prerender(entry, { route: '/about' });
  const outlets = about.match(/data-spark-route=/g) || [];
  assert.equal(outlets.length, 1, `exactly one route outlet, found ${outlets.length}`);
  // The other routes survive as inert <template route> for client navigation,
  // with their imports UNresolved (no leaked content, no booted markers).
  assert.ok(/<template route="\/">/.test(about), 'home template preserved for SPA nav');
  assert.ok(/<template route="\/projects">/.test(about), 'projects template preserved');
  assert.ok(about.includes('import="components/home-pg"'), 'home import left unresolved in its template');
});

await test('the "/" route renders the home page', async () => {
  const home = await prerender(entry, { route: '/' });
  assert.ok(home.includes('home page'));
  assert.ok(!home.includes('about page'));
});

await test('an unknown path renders the catch-all (404) page', async () => {
  const missing = await prerender(entry, { route: '/nope' });
  assert.ok(missing.includes('404 Not Found page'), 'catch-all rendered');
  assert.ok(/data-spark-route="\/nope"/.test(missing));
});

await test('no user catch-all: an unknown path bakes the built-in default 404', async () => {
  const noFallback = join(here, 'fixture', 'routed-no404.html');
  const missing = await prerender(noFallback, { route: NOT_FOUND_ROUTE });
  assert.ok(missing.includes('data-spark-404'), 'default not-found view baked');
  assert.ok(missing.includes('Page not found'), 'default copy present');
  assert.ok(!missing.includes('home page'), 'no route content leaked');
  assert.ok(/<template route="\/">/.test(missing), 'route templates preserved for the client router');
});

await test('redirects + vercel config rewrite clean URLs with an SPA fallback', () => {
  const routes = ['/', '/about', '/projects'];
  const red = redirectsFor(routes);
  assert.ok(red.includes('/about  /about.html  200'));
  assert.ok(red.includes('/projects  /projects.html  200'));
  assert.ok(red.trim().endsWith('/*  /index.html  200'), 'SPA fallback last');
  const vercel = JSON.parse(vercelConfigFor(routes));
  assert.ok(vercel.rewrites.some((r) => r.source === '/about' && r.destination === '/about.html'));
});

// ── SEO: sitemap.xml, robots.txt, noindex ──

await test('noindexRoutesOf() finds routes marked noindex (incl. dynamic)', () => {
  const html = '<body>' +
    '<template route="/"><p>h</p></template>' +
    '<template route="/admin" noindex><p>a</p></template>' +
    '<template route="/drafts/:id" noindex><p>d</p></template>' +
    '<template route="*" noindex><p>nf</p></template>' +
    '</body>';
  assert.deepEqual(noindexRoutesOf(html), ['/admin', '/drafts/:id'], 'catch-all ignored');
});

await test('sitemapFor() emits absolute URLs per route', () => {
  const xml = sitemapFor(['/', '/about', '/a/b'], 'https://example.com/');
  assert.ok(xml.startsWith('<?xml version="1.0"'), 'xml prolog');
  assert.ok(xml.includes('<loc>https://example.com/</loc>'), 'root URL');
  assert.ok(xml.includes('<loc>https://example.com/about</loc>'), 'clean URLs');
  assert.ok(xml.includes('<loc>https://example.com/a/b</loc>'), 'nested route');
  assert.ok(!xml.includes('.html'), 'no file extensions in the sitemap');
});

await test('robotsFor() allows all, disallows noindex, references the sitemap', () => {
  const txt = robotsFor({ site: 'https://example.com', noindex: ['/admin', '/drafts/:id'] });
  assert.ok(txt.includes('User-agent: *'), 'UA line');
  assert.ok(txt.includes('Allow: /'), 'allow all');
  assert.ok(txt.includes('Disallow: /admin'), 'concrete noindex disallowed');
  assert.ok(txt.includes('Disallow: /drafts/'), 'dynamic noindex → static prefix');
  assert.ok(txt.includes('Sitemap: https://example.com/sitemap.xml'), 'sitemap referenced');
});

await test('robotsFor() without a site omits the Sitemap line (zero config)', () => {
  const txt = robotsFor();
  assert.ok(txt.includes('Allow: /'));
  assert.ok(!txt.includes('Sitemap:'), 'no sitemap URL without an origin');
});

await test('a noindex route prerenders WITH <meta name="robots" content="noindex">', async () => {
  const seoEntry = join(here, 'fixture', 'routed-seo.html');
  const admin = await prerender(seoEntry, { route: '/admin' });
  assert.ok(/<meta[^>]*name="robots"[^>]*>/.test(admin) && admin.includes('content="noindex"'),
    'noindex meta injected');
  const home = await prerender(seoEntry, { route: '/' });
  assert.ok(!home.includes('content="noindex"'), 'indexable routes untouched');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
