# Thoughts on spark-html

## What's good

- **No build step for components** — fetch at runtime, works out of the box
- **Reactive proxy approach** (`let x = ...` → auto-render) is elegant for a 0-dep library
- **`store()` / `useStore()`** is simple and effective once you know about it
- **`import` attribute design** — works on any element (`<div import>`, `<span import>`, etc.) and replaces the host with the component's root content. No custom element needed, host acts as a natural fallback. It's HTML's missing module system (CSS has `@import`, JS has `import`, HTML had nothing — Spark fills that gap).

## What's frustrating

> Updated for 0.16.0+ — the two biggest items below are now fixed; kept for the record.

- ~~`export let` being silently broken in served components~~ — **not actually broken.** The natural component API works; the original symptom was an `export let` component imported inside an each-loop, which failed because of the loop-import bug below (fixed in 0.16.0).
- The `onclick="{ func; }"` parsing bug is the kind of thing that wastes hours debugging (still open — use `onclick={func}`)
- ~~No `import` in `each` loops~~ — **fixed in 0.16.0** (works in `template if` too). Loop variables in slots remain a hard limit that forces some inline-everything patterns.
- The docs are basically non-existent outside the scaffold's demo — you have to read the source to understand how anything works

## Verdict

With `export let` props and `import` inside `each` confirmed working as of 0.16.0 (loop variable access in slots being the main remaining gap), spark-html is a genuinely good SPA option for small-to-medium projects where you want Svelte-like reactivity without a build step.

The core value prop is unique: write `.html` files with reactive `let`, `$:`, and `bind:value` that work when fetched at runtime. No Webpack, no Vite plugin, no compiler. That simplicity is real — the scaffold gives you a working reactive app in 3 files.

For a library that's basically one JS file, the reactivity system punches above its weight. The proxy-based scope, `:attr` directives, and scoped CSS are well-designed. If the broken parts worked reliably, it'd be a legitimate alternative to Alpine.js or Petite-Vue for people who want Svelte-like syntax without committing to the Svelte toolchain.

## What no other library has

spark-html is the only library where you write:

```html
<script>
  let count = 0;
  $: doubled = count * 2;
</script>
<button onclick={count++}>{count} × 2 = {doubled}</button>
<style>
  button { color: red; }
</style>
```

— fetch it at runtime as a plain `.html` file, and it just works. Single-file components, reactive declarations, scoped CSS, no toolchain.

## As-is

Promising but check the limitations doc before building anything real.

Lots of libraries claim "just HTML." Spark actually delivers it.

## Why that matters

Most people don't want a framework. They want to write HTML, make it interactive, and be done. Every build step, every config file, every new syntax to learn is friction between "I have an idea" and "it works." Spark removes all of it. That's the point.

## Prerender idea

SSR isn't the only path to SEO. A prerender mode for Spark would work as a separate package (`spark-prerender` or `spark-html/prerender`), not bundled into the runtime:

1. Walk the component tree starting from `index.html`, resolve all `<div import="...">`
2. Evaluate each component's `<script>` in a headless JS env to compute final state
3. Produce fully-interpolated static HTML — `{photos.list.length}` becomes `24 photos`
4. Serialize final state as JSON so Spark hydrates from it on page load
5. Crawlers see complete HTML, users get the same 6.8KB JS

Usage would be a post-build step:

```bash
npx spark-prerender dist/index.html
```

No changes to app code. No SSR server. Just a build-time tool that reads the same files you already ship.

### Page titles and metadata in prerender

The prerender tool runs the component script and inspects designated variables for metadata:

```html
<script>
  let pageTitle = 'Sparksplash — Beautiful free photos';
  let pageDescription = 'Browse our collection of free high-resolution photos';
</script>
```

After execution, it reads `scope.pageTitle` and `scope.pageDescription` and injects them into `<head>` as static `<title>` and `<meta>` tags. No export keyword, no special API.

For dynamic content (loaded per-user or from an API):

- **Route-level prerender** — if you know the content ahead of time (e.g. all photo IDs), generate one static HTML per route, each with its own metadata. Same as any SSG.
- **Client-side fallback** — prerender a generic default, then let Spark update the title reactively after hydration:

```js
$: if (ui.detailPhoto) {
  document.title = `${ui.detailPhoto.title} — Sparksplash`;
} else {
  document.title = 'Sparksplash';
}
```

Crawlers see the prerendered default, real users get the dynamic update.

## TypeScript support — ✅ shipped in 0.17.0

Spark is *not* rewritten in TypeScript — that would add a compile step and a barrier to contributing, contradicting the library's philosophy. Instead, hand-written `.d.ts` files ship **inside** the `spark-html` package (not a separate `@types` package — we own the source, so co-shipping keeps types and runtime in lockstep and TS users need no extra install):

- `src/index.d.ts` — the module API (`mount`, `unmount`, `component`, `store<T>`, `evaluate`, `interpolate`, `parseSFC`), wired via the `types` condition in `exports`.
- `src/vite.d.ts` — the `spark-html/vite` plugin and its options.
- `src/globals.d.ts` — the in-`<script>` builtins (`useStore`, `onMount`, `props`) as ambient globals, opt-in via `/// <reference types="spark-html/globals" />`.

```ts
import { mount, store } from 'spark-html';   // fully typed, autocompletes
```

JS users pay nothing; TS/VSCode users get autocomplete and type checking on the module API for free.

**Scope:** this types the module API you import in `main.js`/`.ts`. It does **not** type the reactive `let`/`$:`/`bind:value` you write *inside* `.html` component `<script>` blocks — that's plain HTML, outside TS's view, and would need a separate language-server/editor extension.
