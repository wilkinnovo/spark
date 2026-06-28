# Spark Roadmap

> How to improve Spark while keeping it **unique**. The test for every item:
> *does it preserve the north star, or erode it?*

## North star (never trade away)

**The `.html` you save is the component that runs — byte-for-byte.**
- No compiler, no proprietary file format, no virtual DOM, view-source-readable.
- ~10KB gzip, **0 runtime dependencies**.
- Mental model = HTML + JS. A component is a file; state is a variable; an update
  is an assignment.

## The principle that's working — keep enforcing it

Core stays tiny; features ship as optional sibling packages (`spark-html-router`,
`spark-html-theme`, `spark-prerender`). **A feature only enters `spark-html` core
if it can't live as a sibling package and pays for its bytes.** Everything else
is `spark-html-*`.

## Progress snapshot

| # | Theme | Status |
|---|-------|--------|
| 1 | Zero-build / CDN / URL-import | ✅ **Done** |
| — | Router: active links + dynamic `:params` + anchor fix | ✅ Done (bonus) |
| — | `spark-html-theme` package | ✅ Done (bonus) |
| 2 | Editor + dev tooling — VS Code ✅, HMR ✅, DevTools ✅ (Zed `{}` grammar ⏳) | ✅ Done* |
| 3 | Ergonomic papercuts — inline handlers ✅, quirks fixed + tested ✅ | ✅ Done |
| 4 | Capability gaps — head ✅, dynamic routes ✅, Map/Set ✅ / motion, nested ◻ | ⏳ Partial |
| 5 | Trust & quality — size guard ✅ / e2e ◻ | ⏳ Partial |

## Priorities

### 1. Zero-build / CDN / URL-import ⭐ — ✅ DONE
The sharpest differentiator, now productized and live:
- ✅ `examples/no-build/` — a runnable, tooling-free app (CDN import map + static
  components), serveable with any static server.
- ✅ Website home: a tabbed hero with **URL import shown first** — a component
  fetched **live, cross-origin, from a CDN** (jsDelivr); prerender bakes it from
  the local copy. Verified live.
- ✅ "Use it — no build required" section on the home page; "No build / CDN"
  docs section; README snippet.
- ✅ URL imports work as-is (`mount()` fetches any URL) — no core change needed.

### 2. Editor + dev tooling — ⏳ PARTIAL
- ✅ **VS Code extension** (`editors/vscode`): TextMate injection that
  JS-highlights `{interpolations}` on top of HTML.
- ⏳ **Zed extension** (`editors/zed`): HTML grammar + script/style injections;
  `{…}` highlighting needs a dedicated `tree-sitter-spark` grammar (follow-up).
- ✅ **HMR**: editing a component re-renders just its instances in place —
  sibling component state is preserved, no full reload. Slotted / loop-managed
  hosts fall back to a full reload (always correct). (spark-html 0.21.3)
- ✅ **Spark DevTools** (`spark-html-devtools`): in-page panel — live store state,
  component tree + state, patch counter, and an amber flash on the component that
  just re-rendered. (0.1.0; uses `inspectStores()` added in spark-html 0.21.4.)

> #2 is done bar the Zed `{}`-interpolation grammar, which needs a dedicated
> `tree-sitter-spark` parser (a separate, larger effort — VS Code already covers
> `{}` highlighting).

### 3. Ergonomic papercuts in core — ✅ DONE
- ✅ **Inline event expressions**: `onclick={count++}` / `{x = e.target.value}` /
  `{add(5)}` run as statements; a bare ref (`{fn}` / `{obj.method}`) is still
  called with the event (0.21.2).
- ✅ Documented quirks (comma `let a='', b=''`, `let name` shadowing, template
  literals in `{…}`, `onsubmit`) were already fixed — now locked with regression
  tests.

### 4. Capability gaps — ⏳ PARTIAL (as optional packages, not core)
- ✅ Router **dynamic routes** (`/blog/:id` → `route.params`) — shipped (0.5.0).
- ✅ **`spark-html-head`** — reactive `<title>`/`<meta>` per route, 0 deps (0.1.0).
- ✅ **`Map`/`Set` reactivity** — mutating a Map/Set in state or a store now
  re-renders; methods still run on the real collection (0.21.5).
- ◻ `spark-html-motion`: CSS-based `transition:fade`/`:slide` (no compiler).
- ◻ Router: **nested routes / layouts**; focus management on navigation (a11y).

### 5. Trust & quality — ⏳ PARTIAL
- ✅ CI bundle-size guard — `npm run size` (and part of `npm test`) fails if the
  minified+gzipped runtime exceeds 12 KB. Currently ~9.9 KB.
- ◻ One real-browser e2e (Playwright): mount → hydrate → router → theme.

## Guardrails — what to refuse (this is how Spark stays unique)

- ❌ No required build step / compiler in core.
- ❌ No virtual DOM.
- ❌ No `.spark` dialect or JSX — components stay real `.html`.
- ❌ No SSR runtime server (build-time `spark-prerender` is the right amount).
- ❌ No core bloat past its byte budget — say no, or make it a package.
