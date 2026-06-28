# ⚡ Spark App

A starter built with [spark-html](https://github.com/wilkinnovo/spark) — single-file
HTML components with built-in reactivity. No compiler, no virtual DOM, no build step.

The scaffold is a live tour of Spark's core features — edit any component and
save to see it update instantly.

## Develop

```bash
npm install
npm run dev
```

## Build (SEO-ready)

```bash
npm run build     # static output → dist/, serve anywhere
npm run preview   # preview the production build locally
```

`npm run build` is **SEO-friendly out of the box**: the `spark-prerender`
Vite plugin runs your app at build time and writes fully-rendered HTML into
`dist/` — so crawlers and AI tools read real content (headings, text, links),
not empty placeholders. The browser still hydrates over it for full
interactivity. Set page metadata as plain component state:

```html
<script>
  let pageTitle = 'My App — does a thing';
  let pageDescription = 'A short, crawlable description of the page.';
</script>
```

Don't need SEO? Remove the `prerender(...)` plugin from `vite.config.js`.

## What's inside

The scaffold's components in `public/components/` each demonstrate a Spark feature
(all using only the published runtime — no experimental APIs):

| Component | Features shown |
|---|---|
| `hero.html` | Local state, `$:` reactive statements, stores (`useStore`), theme toggle |
| `demo-todo.html` | `bind:value`/`bind:checked`, `<template each>` with `key`, `$:` derived counts |
| `demo-props.html` | `export let` props, named `<slot>`, component composition |
| `demo-await.html` | `<template await>` with `once()`, `onMount`, loading/then/catch states |
| `feature-card.html` | Reusable card via `export let` + `<slot>`, used by `demo-props` |

A component is a `.html` file with optional `<script>` and `<style>`. Top-level
variables are reactive state — assigning to one re-patches that component's DOM.
Derive values with `$:`, share state across components with `useStore(name)`, use
`bind:value` for two-way binds, and pass props as attributes on the `import`
placeholder.

See the [full docs](https://wilkinnovo.github.io/spark/docs) for the complete
template syntax reference.
