/**
 * spark-router — built-in default 404.
 * A routed page with NO <template route="*"> used to render nothing for an
 * unknown URL. The router now injects a default catch-all (a user-authored
 * one always wins — covered in router.js).
 */
import '../../spark/test/dom-shim.js';
import { body, parseHTML } from '../../spark/test/dom-shim.js';
import { strict as assert } from 'node:assert';

// ── stub location + history + event listeners ──
const listeners = { click: [], popstate: [] };
globalThis.location = { origin: 'http://localhost', href: 'http://localhost/nope/deep', pathname: '/nope/deep', search: '', hash: '' };
globalThis.history = {
  pushState(_s, _t, url) {
    const u = new URL(url, location.href);
    location.pathname = u.pathname; location.search = u.search; location.hash = u.hash; location.href = u.href;
  },
};
globalThis.document.addEventListener = (type, fn) => { (listeners[type] ||= []).push(fn); };
globalThis.window = globalThis.window || {};
globalThis.window.addEventListener = (type, fn) => { (listeners[type] ||= []).push(fn); };

const { component, store } = await import('spark-html');
const { router, navigate } = await import('../src/index.js');

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); }
}
const tick = () => new Promise((r) => setTimeout(r, 5));

component('home', `<h1>Home page</h1>`);
component('about', `<h1>About us</h1>`);

// NOTE: no route="*" declared.
parseHTML(`
  <template route="/"><div import="home"></div></template>
  <template route="/about"><div import="about"></div></template>
`, body);

await router();
await tick();

console.log('\nspark-router — default 404 (no user catch-all)');
await test('an unknown initial URL renders the built-in 404 view', () => {
  const el = body.querySelector('[data-spark-404]');
  assert.ok(el, 'default not-found view rendered');
  assert.ok(body.textContent.includes('Page not found'), 'default copy shown');
  assert.ok(!body.textContent.includes('Home page'), 'no route content leaked');
});
await test('the default catch-all is injected as a route="*" template', () => {
  const tpl = body.querySelector('template[data-spark-default-404]');
  assert.ok(tpl, 'injected template present');
  assert.equal(tpl.getAttribute('route'), '*');
});
await test('the 404 view links back to the homepage', () => {
  const a = body.querySelector('[data-spark-404] a');
  assert.ok(a, 'home link present');
  assert.equal(a.getAttribute('href'), '/');
});
await test('the route store still reflects the (unmatched) path', () => {
  assert.equal(store('route').path, '/nope/deep');
});
await test('navigating to a real route replaces the 404 view', async () => {
  await navigate('/');
  await tick();
  assert.ok(body.textContent.includes('Home page'), 'home rendered');
  assert.equal(body.querySelector('[data-spark-404]'), null, '404 view removed');
});
await test('navigating to another unknown path shows the 404 again', async () => {
  await navigate('/still/nothing');
  await tick();
  assert.ok(body.querySelector('[data-spark-404]'), '404 view back');
  assert.ok(!body.textContent.includes('Home page'), 'home removed');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
