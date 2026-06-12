# ⚡ Spark monorepo

```
spark-monorepo/
├── packages/
│   └── spark/              ← the publishable library (spark-html)
│       ├── src/index.js    ← runtime: mount(), component(), reactivity
│       ├── src/vite.js     ← vite plugin (spark-html/vite)
│       └── test/run.js     ← node test suite, no browser needed
├── examples/
│   └── basic/              ← vite app consuming the package
│       ├── index.html
│       ├── src/main.js     ← import { mount } from 'spark-html'
│       └── components/     ← single-file .html components
└── website/                ← showcase site + docs, built WITH spark
    ├── index.html          ← landing: hero, live demos, store demo
    ├── docs.html           ← full documentation
    └── components/         ← the site's own spark components
```

## Run the example

```bash
npm install        # links workspaces — spark-html resolves locally
npm run dev        # starts the example at http://localhost:5173
```

## Run the website (showcase + docs)

```bash
npm run site         # dev server
npm run site:build   # static build → website/dist, serve anywhere
```

The site dogfoods Spark — every section, demo, and the docs page itself
is a Spark component.

## Run the tests

```bash
npm test           # 17 tests, pure node, no browser
```

## Use in any project

The package is publish-ready. From this repo you can also link it locally:

```bash
cd packages/spark && npm link
cd ~/my-project   && npm link spark-html
```

Then in your project:

```js
// vite.config.js
import spark from 'spark-html/vite';
export default { plugins: [spark()] };
```

```js
// main.js
import { mount } from 'spark-html';
mount();
```

```html
<!-- index.html -->
<div import="components/anything"></div>
```

See `packages/spark/README.md` for the full template syntax reference.
