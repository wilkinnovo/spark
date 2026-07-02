# ⚡ spark-html-head

Reactive document `<title>` and `<meta>` per route for
[spark-html](https://www.npmjs.com/package/spark-html) — one line. Pairs with
[`spark-html-router`](https://www.npmjs.com/package/spark-html-router)
(or any pushState router): it hooks the History API + `popstate`, so the head
updates on every navigation with no wiring.

```js
import { head } from 'spark-html-head';

head({
  title: { '/': 'Home', '/about': 'About', '*': 'Not found' },
  titleTemplate: (t) => `${t} · My Site`,
  meta: { description: (path) => `The ${path} page` },
});
```

## Install

```bash
npm install spark-html-head
```

## Options

| Option | Type | Meaning |
|--------|------|---------|
| `title` | `string` \| `(path) => string` \| `{ [path]: string }` | The document title. A map may include an `'*'` fallback. |
| `titleTemplate` | `(title) => string` | Wrap the resolved title, e.g. `` t => `${t} · Site` ``. |
| `meta` | `{ [key]: string \| (path) => string }` | `<meta>` to keep updated. Key `"description"` → `<meta name>`; a key with a colon (`"og:title"`) → `<meta property>`. |
| `base` | `string` | Path prefix stripped before matching (e.g. `"/spark"`). |

`head()` returns a `stop()` function. It's framework-agnostic — works with any
router that uses `history.pushState`.

## Per-component metadata — the `head` store

For data-driven pages (CMS, DB), the component that already holds the data
sets its own metadata reactively — no giant `path → title` map in main.js:

```html
<script>
  const route = useStore('route');
  const head = useStore('head');
  let project;
  $: project = projects.all.find((p) => p.slug === route.params.slug);
  $: head.title = project ? `${project.name} · Novo` : 'Novo — 404';
  $: head.description = project?.description;
</script>
```

- `head.title` overrides the config title **verbatim** (`titleTemplate` is not
  re-applied — the component composes the final string).
- Any other key is a `<meta>` override or addition (`description`,
  `og:title`, …), same name/property rules as the config.
- Overrides are **cleared on every path change**, so the next route falls back
  to your `head()` config until its component writes its own values.

> For build-time SEO, declare `pageTitle`/`pageDescription` as component state so
> [`spark-prerender`](https://www.npmjs.com/package/spark-prerender) bakes them
> per route; `head()` handles the live client-side updates on SPA navigation.
