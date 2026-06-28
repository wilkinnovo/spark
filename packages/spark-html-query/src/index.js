/**
 * spark-html-query — declarative async data for spark-html.
 *
 * A `query` is a named store that fetches itself. It runs an async function and
 * exposes the result as reactive store state — `{ data, error, loading,
 * fetching, refetch, mutate, stop }` — so any component reads it with the same
 * `useStore` it already knows, and re-renders as the request settles. Built
 * entirely on `spark-html`'s `store()`: zero extra runtime, one dependency.
 *
 *   import { query } from 'spark-html-query';
 *
 *   query('user', () => fetch('/api/user').then((r) => r.json()), {
 *     refetchInterval: 30000,   // optional: poll every 30s
 *     initialData: null,        // optional: seed before the first fetch
 *   });
 *
 *   // any component:
 *   //   <script>const user = useStore('user');</script>
 *   //   <p :hidden="!user.loading">Loading…</p>
 *   //   <p :hidden="!user.error">Failed: {user.error.message}</p>
 *   //   <h1 :hidden="user.loading">{user.data?.name}</h1>
 *   //   <button onclick="{user.refetch}">Reload</button>
 *
 * Pairs with `derived()` — derive a shaped view from a query store, and the view
 * updates as the request settles, memoized.
 */
import { store } from 'spark-html';

export function query(name, fetcher, options = {}) {
  const s = store(name, {
    data: options.initialData ?? null,
    error: null,
    loading: options.initialData == null, // loading until the first result
    fetching: false,                       // true during ANY fetch (incl. refetch)
  });
  // Tag for tooling (spark-html-devtools) — non-enumerable, never in state dumps.
  try {
    Object.defineProperty(s, Symbol.for('spark.storeKind'), { value: 'query', configurable: true });
  } catch { /* ignore */ }

  let runId = 0;
  async function run() {
    const id = ++runId;
    s.fetching = true;
    if (s.data == null) s.loading = true;
    try {
      const data = await fetcher();
      if (id !== runId) return; // superseded by a newer refetch — drop
      s.data = data;
      s.error = null;
    } catch (e) {
      if (id !== runId) return;
      s.error = e;
    } finally {
      if (id === runId) { s.loading = false; s.fetching = false; }
    }
  }

  // Imperatively set data without a fetch (optimistic updates / cache writes).
  function mutate(next) {
    s.data = typeof next === 'function' ? next(s.data) : next;
    s.error = null;
  }

  s.refetch = run;
  s.mutate = mutate;

  let timer = null;
  if (options.refetchInterval > 0 && typeof setInterval === 'function') {
    timer = setInterval(run, options.refetchInterval);
  }
  s.stop = () => { if (timer) { clearInterval(timer); timer = null; } };

  // Kick off the first fetch (unless seeded with initialData and told to wait).
  if (!(options.initialData != null && options.lazy)) run();

  return s;
}

export default { query };
