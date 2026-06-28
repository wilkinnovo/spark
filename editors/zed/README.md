# Spark for Zed

[spark-html](https://github.com/wilkinnovo/spark) single-file component support
for [Zed](https://zed.dev). It registers a **Spark** language for `.html`
components on top of the HTML tree-sitter grammar, with `<script>` highlighted as
JavaScript and `<style>` as CSS (the standard SFC layout).

## Install (dev extension)

1. Zed → command palette → **`zed: install dev extension`**
2. Select this `editors/zed` folder.

Zed will fetch the HTML grammar pinned in `extension.toml` and load the queries
in `languages/spark/`.

## Scope & follow-up

- ✅ HTML + embedded JS/CSS highlighting for `.html` components.
- ◻ **`{interpolation}` highlighting** (`{count * 2}` as JS) needs a dedicated
  `tree-sitter-spark` grammar — the HTML grammar parses `{…}` as plain text, so
  it can't inject JS into just that span. This is tracked in the repo
  [`ROADMAP.md`](../../ROADMAP.md) under editor tooling. The VS Code extension
  (`editors/vscode`) already does `{…}` highlighting via a TextMate injection.

`path_suffixes = ["html"]` makes Zed treat all `.html` files as Spark while the
extension is enabled; scope it to your components if you prefer.
