/** spark-router — nested routes: layout keep-alive + child swap. */
import '../../spark/test/dom-shim.js';
import { body, parseHTML } from '../../spark/test/dom-shim.js';
import { strict as assert } from 'node:assert';

globalThis.location = { origin: 'http://localhost', href: 'http://localhost/', pathname: '/', search: '', hash: '' };
globalThis.history = {
  pushState(_s, _t, url) {
    const u = new URL(url, location.href);
    location.pathname = u.pathname; location.search = u.search; location.hash = u.hash; location.href = u.href;
  },
};
globalThis.document.addEventListener = () => {};
globalThis.window = globalThis.window || {};
globalThis.window.addEventListener = () => {};

const { component } = await import('spark-html');
const { router, navigate } = await import('../src/index.js');

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); }
}
const tick = () => new Promise((r) => setTimeout(r, 6));
const has = (s) => assert.ok(body.textContent.includes(s), `expected "${s}"\n  got: ${body.textContent.replace(/\s+/g, ' ').trim().slice(0, 140)}`);
const hasnt = (s) => assert.ok(!body.textContent.includes(s), `did NOT expect "${s}"`);

globalThis.__lm = 0; // layout mount count
component('dlayout', `<div class="dnav">DASH NAV</div><script>onMount(() => { globalThis.__lm++; });<\/script>`);
component('dhome', `<h1>DASH HOME</h1>`);
component('dsettings', `<h1>DASH SETTINGS</h1>`);
component('homepg', `<h1>HOME PAGE</h1>`);

parseHTML(`
  <template route="/"><div import="homepg"></div></template>
  <template route="/dash">
    <div import="dlayout"></div>
    <section class="kids">
      <template route="/dash"><div import="dhome"></div></template>
      <template route="/dash/settings"><div import="dsettings"></div></template>
    </section>
  </template>
`, body);

await router();
await tick();

console.log('\nspark-router — nested routes');

await test('layout + index child render together', async () => {
  await navigate('/dash');
  await tick();
  has('DASH NAV');
  has('DASH HOME');
  assert.equal(globalThis.__lm, 1, 'layout mounted once');
});

await test('child swaps while the layout is kept alive (not re-mounted)', async () => {
  await navigate('/dash/settings');
  await tick();
  has('DASH NAV');
  has('DASH SETTINGS');
  hasnt('DASH HOME');
  assert.equal(globalThis.__lm, 1, 'layout NOT re-mounted on child nav');
});

await test('back to the index child keeps the same layout', async () => {
  await navigate('/dash');
  await tick();
  has('DASH HOME');
  hasnt('DASH SETTINGS');
  has('DASH NAV');
  assert.equal(globalThis.__lm, 1);
});

await test('leaving the layout tears it down', async () => {
  await navigate('/');
  await tick();
  has('HOME PAGE');
  hasnt('DASH NAV');
});

await test('re-entering the layout mounts it fresh', async () => {
  await navigate('/dash/settings');
  await tick();
  has('DASH NAV');
  has('DASH SETTINGS');
  assert.equal(globalThis.__lm, 2, 'layout re-mounted after leaving + returning');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
