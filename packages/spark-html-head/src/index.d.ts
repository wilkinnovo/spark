/**
 * spark-html-head — reactive document <title>/<meta> per route. Zero deps.
 */

export interface HeadOptions {
  /**
   * The document title: a fixed string, a `(path) => string`, or a
   * `{ path: title }` map (with an optional `'*'` fallback).
   */
  title?: string | ((path: string) => string) | Record<string, string>;
  /** Wrap the resolved title, e.g. `(t) => `${t} · My Site``. */
  titleTemplate?: (title: string) => string;
  /**
   * `<meta>` tags to keep updated. Key `"description"` → `<meta name>`, a key
   * with a colon (`"og:title"`) → `<meta property>`. Value is a string or a
   * `(path) => string`.
   */
  meta?: Record<string, string | ((path: string) => string)>;
  /** Path prefix stripped before matching (e.g. `"/spark"`). */
  base?: string;
}

/**
 * Keep the document `<title>`/`<meta>` in sync with the route — hooks the
 * History API + popstate, so it updates on every navigation. Returns a
 * `stop()` function.
 */
export function head(options?: HeadOptions): () => void;

declare const _default: { head: typeof head };
export default _default;
