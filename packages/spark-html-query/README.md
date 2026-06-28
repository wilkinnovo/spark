# ⚡ spark-html-query

Declarative async data for [spark-html](https://www.npmjs.com/package/spark-html)
— a **self-fetching reactive store**. One dependency (`spark-html`), built
entirely on its `store()`.

A `query` runs an async function and exposes the result as reactive store state.
Any component reads it with the same `useStore` it already knows, and re-renders
as the request settles — no `onMount`, no manual `loading` flags, no `fetch`
boilerplate.

```js
import { query } from 'spark-html-query';

query('user', () => fetch('/api/user').then((r) => r.json()));
```

```html
<!-- any component -->
<script>const user = useStore('user');</script>

<p :hidden="!user.loading">Loading…</p>
<p :hidden="!user.error">Failed: {user.error.message}</p>
<h1 :hidden="user.loading">{user.data?.name}</h1>
<button onclick="{user.refetch}">Reload</button>
```

## Install

```bash
npm install spark-html-query
```

## State

`useStore(name)` returns a reactive object:

| Key | Meaning |
|-----|---------|
| `data` | The latest resolved value (or `initialData` / `null` before the first). |
| `error` | The last rejection, or `null`. |
| `loading` | `true` until the first successful result (no `data` yet). |
| `fetching` | `true` during **any** in-flight fetch, including a refetch over existing data. |
| `refetch()` | Re-run the fetcher. A newer call supersedes an older in-flight one. |
| `mutate(next)` | Set `data` directly without fetching (optimistic update). Value or `(prev) => next`. |
| `stop()` | Stop the `refetchInterval` poller, if any. |

## Options

```js
query('feed', fetchFeed, {
  initialData: [],          // seed data; skips the initial `loading` state
  refetchInterval: 30000,   // poll every 30s
  lazy: true,               // with initialData: wait for the first refetch()
});
```

## Pairs with `derived`

Shape a query into exactly what a component needs, memoized — the view updates
as the request settles:

```js
import { query } from 'spark-html-query';
import { derived } from 'spark-html';

query('todos', fetchTodos);
derived('todoStats', ['todos'], (q) => ({
  total: q.data?.length ?? 0,
  done: q.data?.filter((t) => t.done).length ?? 0,
  loading: q.loading,
}));
```

> `loading` vs `fetching`: show a **skeleton** on `loading` (first load, no data
> yet) and a subtle **spinner** on `fetching` (background refresh that keeps the
> stale data visible). That's the stale-while-revalidate pattern, declaratively.
