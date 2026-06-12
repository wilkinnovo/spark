# ⚡ spark-html

Single-file HTML components with built-in reactivity. No compiler, no virtual DOM, no build step.

## Install

```bash
npm install spark-html
```

## Quick start

A component is a plain `.html` file — markup, script, style:

```html
<!-- components/welcome.html -->
<h1>Welcome {name}</h1>

<script>
  let name = 'John Doe';
</script>

<style>
  h1 { color: rebeccapurple; }
</style>
```

Import it in your page and mount:

```html
<!-- index.html -->
<body>
  <div import="components/welcome"></div>
  <script type="module">
    import { mount } from 'spark-html';
    mount();
  </script>
</body>
```

## With Vite

```js
// vite.config.js
import { defineConfig } from 'vite';
import spark from 'spark-html/vite';

export default defineConfig({ plugins: [spark()] });
```

The plugin serves component fragments raw and full-reloads when they change.

## API

### Template syntax

| Feature             | Syntax                                           |
|---------------------|--------------------------------------------------|
| Text binding        | `<p>Hello {name}</p>`                            |
| Expressions         | `<p>{price * qty}</p>` `{ok ? 'x' : 'y'}`        |
| Events              | `<button onclick={add}>`                         |
| Dynamic attributes  | `<button :disabled="count >= 10">`               |
| Attribute interp    | `<input value="{input}">`                        |
| Loops               | `<template each="todo in todos">…</template>`    |
| Loops with index    | `<template each="todo, i in todos">…</template>` |
| Scoped styles       | `<style>` auto-scoped to the component           |
| Global styles       | `:global(body) { … }` escapes scoping            |
| Two-way binding     | `<input bind:value="draft">` / `bind:checked`     |
| Reactive statements | `$: doubled = count * 2` — re-runs on change      |
| Conditional blocks  | `<template if="show">…</template>`                |
| Lifecycle           | `onMount(fn)` builtin; return a fn for cleanup    |
| Escape hatch        | `spark-ignore` attribute — subtree never patched  |

### Props

Attributes on the import placeholder become props. `export let` in the
component declares which variables are props, with defaults:

```html
<div import="components/profile" name="Ada Lovelace" age="36" admin></div>
```

```html
<!-- components/profile.html -->
<h2>{name}{admin ? ' (admin)' : ''}, {age}</h2>
<script>
  export let name = 'Anonymous';
  export let age = 0;        // "36" is coerced to number 36
  export let admin = false;  // bare attribute → true
</script>
```

Coercion: numbers, `true`/`false`, `null`, and JSON (`items='["a","b"]'`)
are parsed; everything else stays a string. Variables declared with plain
`let` are private — outside attributes cannot override them.

### Stores (shared state)

Create named stores in app code; subscribe from any component with the
`useStore` builtin. Every subscriber re-patches when the store changes:

```js
// main.js
import { mount, store } from 'spark-html';
store('cart', { items: [], total: 0 });
mount();
```

```html
<!-- any component -->
<p>{cart.items.length} items — ${cart.total}</p>
<script>
  const cart = useStore('cart');
  function add() {
    cart.items = [...cart.items, 'thing'];
    cart.total = cart.total + 4;
  }
</script>
```

### JavaScript

```js
import { mount, component, store } from 'spark-html';

await mount();          // whole document
await mount('#app');    // a subtree

// register a component from a string (no file needed) — great for tests
component('hello', `
  <h1>Hi {who}</h1>
  <script>let who = 'tester';<\/script>
`);
```

## How it works

1. `mount()` finds `<div import="...">` placeholders and fetches each file.
2. Script and style are extracted from the raw text **before** the markup
   touches `innerHTML` (browsers strip script tags injected that way).
3. The script runs inside a `Proxy` scope; every assignment re-patches
   only that component's DOM.
4. Styles are auto-scoped via a `[name="component"]` prefix.

## Limits

- One reactive scope per component (top-level `let`/`function`)
- Block-scoped `let/const` inside functions hoist to component scope
- Loop bodies are read-only snapshots; replace the array to update
