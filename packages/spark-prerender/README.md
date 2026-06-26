# ⚡ spark-prerender

A friendly **SEO interface for [spark-html](https://www.npmjs.com/package/spark-html)** — make a client-rendered Spark site indexable by crawlers with **no rewrite, no SSR server, and no app-code changes**.

It is a build-time CLI. Point it at your entry HTML and it writes back fully-rendered, crawler-ready HTML: `{interpolations}` resolved, `each`/`if` and nested imports rendered, component `<style>` scoped and inlined, and page metadata injected into `<head>`.

## The one idea

This is **not a second renderer**. The Spark runtime is DOM-agnostic, so prerendering just:

> sets up a server DOM (linkedom) + the few globals the runtime expects → runs the **real** `mount()` → lets the component tree settle → serializes `document`.

One renderer, one source of truth, **zero client/prerender drift**.

## Install

```bash
npm install --save-dev spark-prerender
```

## Use

```bash
# one page or many (multi-page sites are an MPA — just list each page)
npx spark-prerender dist/index.html dist/docs.html

# write copies elsewhere instead of rewriting in place
npx spark-prerender site/index.html --out build --root site
```

As a post-build step over a Vite `dist/`:

```bash
vite build
npx spark-prerender dist/index.html dist/docs.html
```

### Options

| Flag | Meaning |
|------|---------|
| `--out <dir>` | Write `<dir>/<basename>` instead of rewriting the entry in place. |
| `--root <dir>` | Base dir for resolving `import="components/x"` (default: the entry's dir; also tries `<root>/public` and `<root>/dist`). |
| `-h`, `--help` | Show help. |

### Programmatic API

```js
import { prerender } from 'spark-prerender';

const html = await prerender('dist/index.html', { root: 'dist' });
```

## Metadata — no special API

The prerenderer reads designated variables off each component's scope (first
defined wins, in DOM order) and writes them into `<head>`:

```html
<script>
  let pageTitle = 'Spark — HTML that reacts!';
  let pageDescription = 'Single-file HTML components with built-in reactivity.';
</script>
```

→ a static `<title>` and `<meta name="description">`. Defaults also cover
`ogTitle` / `ogDescription` / `ogImage` (→ `<meta property="og:…">`). Pass your
own `meta` mapping to `prerender()` to customize. If no component declares a
var, the entry HTML's existing `<head>` is left as-is.

## Scope (v1 — Phase 1)

What it captures: everything from a component's **initial scope** —
interpolations, `each`/`if`, nested imports, scoped styles, and metadata vars.
This covers marketing, docs, and landing pages.

Honest limitations:

- **Async/API data is not captured** by design — content loaded in `onMount`
  from a `fetch`/store stays client-rendered (the crawler still gets the static
  shell + real metadata, already a big SEO win). An awaitable data hook is the
  planned Phase 2 — additive, no rework.
- **Stores created in `main.js` are not present.** The entry's bootstrap
  `<script>` is not executed (linkedom doesn't run page scripts); the
  prerenderer calls `mount()` itself. Components that read a store render with
  empty state (and warn) — that content is client-rendered.
- **No DOM adoption / hydration in v1.** The output is static, crawler-ready
  HTML. Re-mounting the same runtime over it (true hydration) is a later phase
  (near a boot rewrite). For interactive pages, treat this as the SEO shell.
- `spark-ignore` regions (e.g. `<pre>` code samples) are left literal, exactly
  as in the browser.

## Notes

- Only dependency is **linkedom** (server DOM); it lives in this package, so the
  `spark-html` runtime stays 0-dependency.
- Requires a real `node`/`npm` install to populate `package-lock.json` for CI.
