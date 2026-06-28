/** spark-html-query — self-fetching reactive store: loading/error/refetch/mutate. */
import { strict as assert } from 'node:assert';
import { store, derived } from 'spark-html';
import { query } from '../src/index.js';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); }
}
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

console.log('spark-html-query');

await test('starts loading, then resolves into data', async () => {
  let resolve;
  query('q1', () => new Promise((r) => { resolve = r; }));
  const q = store('q1');
  assert.equal(q.loading, true, 'loading before the first result');
  assert.equal(q.fetching, true);
  assert.equal(q.data, null);
  resolve({ name: 'Ada' });
  await tick();
  assert.equal(q.loading, false);
  assert.equal(q.fetching, false);
  assert.deepEqual(q.data, { name: 'Ada' });
  assert.equal(q.error, null);
});

await test('a rejected fetch lands in error and clears loading', async () => {
  query('q2', () => Promise.reject(new Error('nope')));
  await tick();
  const q = store('q2');
  assert.equal(q.loading, false);
  assert.equal(q.error.message, 'nope');
  assert.equal(q.data, null);
});

await test('refetch() re-runs and supersedes an older in-flight call', async () => {
  let calls = 0;
  const resolvers = [];
  query('q3', () => new Promise((r) => { calls++; resolvers.push(r); }));
  const q = store('q3');
  await tick();
  q.refetch();                 // second call, first still pending
  await tick();
  assert.equal(calls, 2);
  resolvers[0]({ v: 'stale' }); // older settles first — must be dropped
  resolvers[1]({ v: 'fresh' });
  await tick();
  assert.deepEqual(q.data, { v: 'fresh' }, 'newest result wins');
});

await test('initialData seeds data and skips the initial loading state', async () => {
  query('q4', () => Promise.resolve([1, 2, 3]), { initialData: [] });
  const q = store('q4');
  assert.deepEqual(q.data, []);
  assert.equal(q.loading, false, 'not loading — has seed data');
  await tick();
  assert.deepEqual(q.data, [1, 2, 3]);
});

await test('mutate() sets data optimistically without a fetch', async () => {
  query('q5', () => Promise.resolve({ count: 0 }));
  await tick();
  const q = store('q5');
  q.mutate((prev) => ({ count: prev.count + 5 }));
  assert.deepEqual(q.data, { count: 5 });
  assert.equal(q.error, null);
});

await test('derived() can shape a query store and tracks its settle', async () => {
  query('todos', () => Promise.resolve([{ done: true }, { done: false }]));
  derived('todoStats', ['todos'], (q) => ({
    total: q.data?.length ?? 0,
    done: q.data?.filter((t) => t.done).length ?? 0,
    loading: q.loading,
  }));
  const stats = store('todoStats');
  assert.equal(stats.loading, true);   // before settle
  await tick();
  assert.equal(stats.total, 2);
  assert.equal(stats.done, 1);
  assert.equal(stats.loading, false);
});

await test('tags its store kind as "query" for devtools', () => {
  const q = store('q1');
  assert.equal(q[Symbol.for('spark.storeKind')], 'query');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
