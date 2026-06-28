/**
 * spark-html-query — declarative async data for spark-html.
 *
 * `query(name, fetcher, options?)` creates a self-fetching store. Read it with
 * `useStore(name)` from any component; it re-renders as the request settles.
 */

export interface QueryState<T> {
  /** The latest resolved value, or `initialData` / `null` before the first one. */
  data: T | null;
  /** The last rejection, or `null`. */
  error: unknown;
  /** True until the first successful result (no `data` yet). */
  loading: boolean;
  /** True during ANY in-flight fetch, including a refetch over existing data. */
  fetching: boolean;
  /** Re-run the fetcher. A newer call supersedes an older in-flight one. */
  refetch: () => Promise<void>;
  /** Set `data` directly without fetching (optimistic update). Accepts a value or updater. */
  mutate: (next: T | ((prev: T | null) => T)) => void;
  /** Stop the `refetchInterval` poller, if any. */
  stop: () => void;
}

export interface QueryOptions<T> {
  /** Seed `data` before the first fetch (skips the initial `loading` state). */
  initialData?: T | null;
  /** Poll the fetcher on this interval (ms). */
  refetchInterval?: number;
  /** With `initialData`, don't fetch on creation — wait for the first `refetch()`. */
  lazy?: boolean;
}

/**
 * Create a named, self-fetching reactive store.
 *
 * ```ts
 * query('user', () => fetch('/api/user').then((r) => r.json()));
 * // component: const user = useStore('user'); → {user.data?.name}
 * ```
 */
export function query<T = unknown>(
  name: string,
  fetcher: () => Promise<T> | T,
  options?: QueryOptions<T>,
): QueryState<T>;

declare const _default: { query: typeof query };
export default _default;
