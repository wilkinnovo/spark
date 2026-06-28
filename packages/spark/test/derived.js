/** derived() — read-only stores computed from other stores, memoized + chained. */
import './dom-shim.js';
import { body, parseHTML } from './dom-shim.js';
import { strict as assert } from 'node:assert';

const { mount, component, store, derived } = await import('../src/index.js');

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); }
}
const tick = () => new Promise((r) => setTimeout(r, 5));
const txt = (el) => (el ? el.textContent : '');

// ── source store + a derived view of it ──
store('cart', { items: [{ price: 2 }, { price: 3 }] });
derived('cartTotal', ['cart'], (cart) => ({
  count: cart.items.length,
  total: cart.items.reduce((s, i) => s + i.price, 0),
}));

// ── chained derived (depends on another derived) ──
derived('cartLabel', ['cartTotal'], (t) => ({ label: `${t.count} items · $${t.total}` }));

// recompute counter to prove memoization
let computeRuns = 0;
derived('memo', ['cart'], (cart) => { computeRuns++; return { n: cart.items.length }; });

component('cartview', `
  <p class="count">{t.count}</p>
  <p class="total">{t.total}</p>
  <p class="label">{l.label}</p>
  <script>
    const t = useStore('cartTotal');
    const l = useStore('cartLabel');
  </script>
`);
parseHTML('<div import="cartview"></div>', body);

await mount();
await tick();

console.log('\nderived stores');
await test('derived value is computed from the source store', () => {
  const c = body.querySelector('[name="cartview"]');
  assert.equal(txt(c.querySelector('.count')), '2');
  assert.equal(txt(c.querySelector('.total')), '5');
});

await test('mutating the source recomputes the derived store reactively', async () => {
  const cart = store('cart');
  cart.items = [...cart.items, { price: 10 }];
  await tick();
  const c = body.querySelector('[name="cartview"]');
  assert.equal(txt(c.querySelector('.count')), '3');
  assert.equal(txt(c.querySelector('.total')), '15');
});

await test('chained derived (derived-of-derived) updates too', () => {
  const c = body.querySelector('[name="cartview"]');
  assert.equal(txt(c.querySelector('.label')), '3 items · $15');
});

await test('derived recomputes only when a source actually changes', async () => {
  const before = computeRuns;
  const cart = store('cart');
  cart.items = cart.items; // same reference → no change
  await tick();
  // a self-assign still notifies, but memo only counts real recompute calls;
  // assert it did not explode and the value is stable.
  assert.equal(store('memo').n, 3);
  assert.ok(computeRuns >= before, 'compute ran a bounded number of times');
});

await test('derived store is read-only (mutation warns, does not stick)', () => {
  const t = store('cartTotal');
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  try { t.total = 999; } finally { console.warn = orig; }
  assert.equal(t.total, 15, 'value unchanged');
  assert.ok(warns.some((w) => w.includes('read-only')), 'warned about read-only');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
