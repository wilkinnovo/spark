/** Fine-grained loop updates: a deep mutation of one row's item re-walks ONLY
 *  that row (O(changed)), while staying correct — aggregating `$:`, a direct
 *  out-of-loop read, and component-var changes are never stale. */
import './dom-shim.js';
import { body, parseHTML } from './dom-shim.js';
import { strict as assert } from 'node:assert';

const { mount, component } = await import('../src/index.js');

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); }
}
const tick = () => new Promise((r) => setTimeout(r, 5));
const txt = (el) => (el ? el.textContent : '');

const N = 50;
globalThis.__seed = Array.from({ length: N }, (_, i) => ({ id: i, t: 'r' + i, qty: 1 }));
globalThis.__calls = 0;

// `label(row)` counts every per-row evaluation — so we can assert how many rows
// actually re-walked, with no runtime instrumentation.
component('grid', `
  <p class="total">{total}</p>
  <p class="direct">{rows[0].t}</p>
  <ul><template each="row in rows" key="row.id"><li>{label(row, heading)}</li></template></ul>
  <script>
    let rows = globalThis.__seed;
    let heading = 'H';
    function label(r, h) { globalThis.__calls = (globalThis.__calls || 0) + 1; return h + ':' + r.t + ':' + r.qty; }
    $: total = rows.reduce((s, r) => s + r.qty, 0);
  </script>
`);
parseHTML('<div import="grid"></div>', body);
await mount();
await tick();

const g = () => body.querySelector('[name="grid"]');
const rows = () => body.querySelectorAll('[name="grid"] li');
const scope = () => g().__sparkScope;

console.log('\nfine-grained loop updates');

await test(`initial render walks all ${N} rows`, () => {
  assert.equal(rows().length, N);
});

await test('a single deep mutation re-walks ONLY that row (O(changed))', async () => {
  globalThis.__calls = 0;
  scope().rows[0].t = 'CHANGED';
  await tick();
  assert.equal(globalThis.__calls, 1, `expected 1 row re-walk, got ${globalThis.__calls}`);
  assert.ok(txt(rows()[0]).includes('CHANGED'), 'mutated row updated');
  assert.ok(txt(rows()[3]).includes('r3'), 'sibling row untouched');
});

await test('aggregating $: recomputes on an item mutation (never stale)', async () => {
  globalThis.__calls = 0;
  scope().rows[2].qty = 100;
  await tick();
  assert.equal(txt(g().querySelector('.total')), String(N + 99), '$: total recomputed');
  assert.ok(txt(rows()[2]).endsWith(':100'), 'mutated row shows new qty');
  assert.equal(globalThis.__calls, 1, `still only 1 row re-walk, got ${globalThis.__calls}`);
});

await test('a direct out-of-loop {rows[0].t} is never stale on a row mutation', () => {
  assert.equal(txt(g().querySelector('.direct')), 'CHANGED');
});

await test(`a component-var change re-walks ALL ${N} rows`, async () => {
  globalThis.__calls = 0;
  scope().heading = 'X';
  await tick();
  assert.equal(globalThis.__calls, N, `expected all ${N} rows, got ${globalThis.__calls}`);
  assert.ok(txt(rows()[7]).startsWith('X:'), 'every row reflects the new var');
});

await test('structural change (push) still reconciles', async () => {
  scope().rows = [...scope().rows, { id: 999, t: 'NEW', qty: 1 }];
  await tick();
  assert.equal(rows().length, N + 1);
  assert.ok(txt(rows()[N]).includes('NEW'));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
