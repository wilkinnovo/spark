/**
 * Prerender robustness: real setTimeout (undici-safe) and imports nested
 * inside a <template if> (the async-boot case).
 */
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { prerender } from '../src/prerender.js';

const here = dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); }
}

console.log('\nspark-prerender — robustness');

await test('setTimeout returns a real, unref-able Timer (undici-safe)', async () => {
  // The old stub returned 0; undici then crashed on `timer.unref()`.
  const out = await prerender(join(here, 'fixture', 'timer.html'));
  assert.ok(out.includes('timer-ok'), `expected timer-ok, got: ${out.match(/status">[^<]*/)}`);
  assert.ok(!out.includes('BROKEN'), 'setTimeout must not be a stub returning a number');
});

await test('an import inside <template if> renders during prerender', async () => {
  const out = await prerender(join(here, 'fixture', 'if-import.html'));
  assert.ok(out.includes('Inside If — 9'), 'if-block import rendered with props');
  assert.ok(out.includes('name="card"'), 'inner component host present');
});

await test('onMount is skipped at build time — no __SPARK_PRERENDER__ guard needed', async () => {
  // The component's onMount opens a WebSocket (live-only work that used to
  // crash or hang the build unless the author added a manual guard).
  delete globalThis.__liveOnlyMountRan;
  const out = await prerender(join(here, 'fixture', 'live-only.html'));
  assert.ok(out.includes('skeleton'), 'the loading state is what gets baked');
  assert.equal(globalThis.__liveOnlyMountRan, undefined, 'onMount must not run during prerender');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
