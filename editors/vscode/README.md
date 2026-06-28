# Spark for VS Code

Syntax highlighting for [spark-html](https://github.com/wilkinnovo/spark)
single-file components. It's an **injection grammar** layered on top of VS Code's
built-in HTML, so `.html` components keep full HTML/CSS/JS highlighting and gain:

- **`{interpolations}`** highlighted as JavaScript — `{count * 2}`, `{ok ? a : b}`.
- `\{` escaped braces are left as literal text.
- `<script>` reactive statements (`$:`), `bind:`, `:attr`, `on*`, and `import`
  attributes get the editor's normal JS / attribute highlighting.

## Install (from source)

VS Code can't run from a folder directly — package it once with `vsce`:

```bash
cd editors/vscode
npx @vscode/vsce package          # produces spark-html-0.1.0.vsix
code --install-extension spark-html-0.1.0.vsix
```

Or drop the folder into `~/.vscode/extensions/spark-html` and reload.

## Notes

- The injection is scoped `L:text.html -comment -(meta.embedded | source)` so it
  never touches CSS `{}` blocks or `<script>`/`<style>` bodies.
- Component `<script>`/`<style>` are already highlighted by VS Code's HTML
  grammar; this extension only adds the Spark-specific `{…}` layer.
