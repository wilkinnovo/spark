# ⚡ spark-html-image

Build-time image optimization for [spark-html](https://www.npmjs.com/package/spark-html)
sites — a Vite plugin that converts your `<img>` references to **webp/avif**
with a responsive `srcset`, **zero config**. No more hand-written
`scripts/optimize-images.js` wired into the build command.

```js
// vite.config.js
import spark from 'spark-html/vite';
import prerender from 'spark-prerender/vite';
import image from 'spark-html-image';

export default {
  plugins: [spark(), prerender(), image()],
};
```

That's it. After the build, every local `.png`/`.jpg` referenced by an `<img>`
in the output — pages **and** component `.html` fragments — is:

- converted to webp at several widths (never upscaled past the original),
- rewritten with `srcset` + `sizes` (the original file stays as the `src`
  fallback),
- given `width`/`height` (no layout shift) and `loading="lazy"` +
  `decoding="async"` when absent.

```html
<img src="/img/hero.png" alt="hero">
<!-- becomes -->
<img src="/img/hero.png" alt="hero"
     srcset="/img/hero-640.webp 640w, /img/hero-960.webp 960w, /img/hero.webp 1600w"
     sizes="100vw" width="1600" height="900" loading="lazy" decoding="async">
```

External URLs, SVGs, and any `<img>` that already has a `srcset` (or sits in a
`<picture>`) are left alone — the author knows best.

## Install

```bash
npm install -D spark-html-image
```

## Options

| Option | Default | Meaning |
|--------|---------|---------|
| `widths` | `[640, 960, 1280, 1920]` | srcset widths, capped at each image's intrinsic width. |
| `formats` | `['webp']` | `'webp'` and/or `'avif'`; order = `<source>` order in picture mode. |
| `quality` | `80` | Encoder quality. |
| `sizes` | `'100vw'` | Written alongside `srcset` when the img has no `sizes`. |
| `picture` | `false` | Wrap in `<picture>` with one `<source>` per format (use with avif). |
| `lazy` | `true` | Add `loading="lazy"` + `decoding="async"` when absent. |

```js
image({ formats: ['avif', 'webp'], picture: true, quality: 75 })
```

It runs in `closeBundle` (order `post`), after
[`spark-prerender`](https://www.npmjs.com/package/spark-prerender) has written
its per-route HTML — so prerendered pages are optimized too. Conversion uses
[sharp](https://sharp.pixelplumbing.com/).
