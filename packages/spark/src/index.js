/**
 *  ⚡ Spark v2 — single-file HTML components, zero build step.
 *
 *  A component file is just:
 *
 *    <h1>Welcome {name}</h1>
 *    <script>  let name = 'John Doe';  </script>
 *    <style>   h1 { color: rebeccapurple; }  </style>
 *
 *  No wrapper element required. Import with:
 *
 *    <div import="components/welcome"></div>
 *
 *  Key design decision: <script> and <style> are extracted from the RAW
 *  FETCHED TEXT with a tokenizer — before the markup ever touches
 *  innerHTML. Browsers neuter/strip <script> tags injected via innerHTML,
 *  which is why DOM-based extraction is unreliable. Text-level extraction
 *  sidesteps the whole class of bugs.
 */


// ─── Expression evaluation ─────────────────────────────────────────────
function evaluate(code, scope) {
  try {
    return new Function('__scope__', `with(__scope__) { return (${code}) }`)(
      scope,
    );
  } catch {
    return '';
  }
}

function execute(code, scope, event = null, __val__ = undefined) {
  try {
    // `event` is a real parameter — handlers receive it directly, with no
    // proxy writes (which would trigger a re-patch mid-click) and no
    // reliance on the deprecated window.event (absent in Firefox).
    // `__val__` carries the element value for two-way bindings.
    new Function('__scope__', 'event', '__val__', `with(__scope__) { ${code} }`)(
      scope,
      event,
      __val__,
    );
  } catch (e) {
    console.warn(`[spark] Error in "${code}":`, e.message);
  }
}

function interpolate(template, scope) {
  return template.replace(/\{([^}]+)\}/g, (_, code) => {
    const v = evaluate(code.trim(), scope);
    return v == null ? '' : String(v);
  });
}

// ─── Single-file component parser (text level) ────────────────────────
// Splits raw component text into { markup, script, style } without
// ever putting <script> through innerHTML.
function parseSFC(source) {
  let script = '';
  let style = '';

  let markup = source.replace(
    /<script[^>]*>([\s\S]*?)<\/script>/gi,
    (_, body) => {
      script += body + '\n';
      return '';
    },
  );
  markup = markup.replace(
    /<style[^>]*>([\s\S]*?)<\/style>/gi,
    (_, body) => {
      style += body + '\n';
      return '';
    },
  );

  return { markup: markup.trim(), script: script.trim(), style: style.trim() };
}

// ─── Import resolution ─────────────────────────────────────────────────
async function resolveImports(root) {
  const nodes = [...root.querySelectorAll('[import]')];
  await Promise.all(
    nodes.map(async (node) => {
      let path = node.getAttribute('import');
      if (!path.endsWith('.html')) path += '.html';
      try {
        const res = await _origFetchComponent(path);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const source = await res.text();

        const compName = path.replace(/.*\//, '').replace('.html', '');
        const { markup, script, style } = parseSFC(source);

        // Build the component host. The import placeholder itself becomes
        // the host, so classes/ids on it are preserved.
        const host = document.createElement('div');
        host.setAttribute('name', compName);
        // Placeholder attributes become PROPS (except import/class/id,
        // which keep their normal HTML meaning and are carried over).
        const props = {};
        for (const attr of node.attributes) {
          if (attr.name === 'import') continue;
          if (attr.name === 'class' || attr.name === 'id') {
            host.setAttribute(attr.name, attr.value);
            continue;
          }
          props[attr.name] = coerce(attr.value);
        }
        host.__sparkProps = props;
        host.innerHTML = markup; // markup contains no <script>/<style> now

        // stash extracted source on the element — bootComponent reads these
        host.__sparkScriptSrc = script;
        host.__sparkStyleSrc = style;

        await resolveImports(host); // nested imports
        node.replaceWith(host);
      } catch (e) {
        console.warn(`[spark] Could not import "${path}":`, e.message);
      }
    }),
  );
}

// Coerce attribute strings into sensible JS values for props.
function coerce(v) {
  if (v === '') return true;          // bare attribute → boolean true
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  if (v !== '' && !isNaN(Number(v))) return Number(v);
  try { return JSON.parse(v); } catch { /* keep as string */ }
  return v;
}

// ─── Stores: shared reactive state across components ──────────────────
const stores = new Map();           // name → { state, subscribers }

/**
 * Create (or get) a named store.
 *
 *   // app code
 *   import { store } from 'spark-html';
 *   store('cart', { items: [], total: 0 });
 *
 *   // inside any component script
 *   const cart = useStore('cart');
 *   cart.items = [...cart.items, thing];   // every subscriber re-patches
 */
function store(name, initial) {
  if (stores.has(name)) return stores.get(name).proxy;

  const entry = { state: { ...(initial || {}) }, subscribers: new Set() };

  entry.proxy = new Proxy(entry.state, {
    get(target, key) {
      if (key === Symbol.unscopables) return undefined;
      return target[key];
    },
    set(target, key, value) {
      target[key] = value;
      entry.subscribers.forEach((fn) => fn());
      return true;
    },
  });

  stores.set(name, entry);
  return entry.proxy;
}

// Subscribe a component element to a store; returns the store proxy.
function subscribeStore(name, componentEl, scopeRef) {
  const entry = stores.get(name);
  if (!entry) {
    console.warn(`[spark] useStore("${name}") — store not created. Call store("${name}", initial) before mount().`);
    return store(name, {});
  }
  entry.subscribers.add(() => {
    if (scopeRef.scope && componentEl.isConnected) patch(componentEl, scopeRef.scope);
  });
  return entry.proxy;
}

// ─── Reactive scope ────────────────────────────────────────────────────
function makeScope(rawCode, componentEl, props = {}) {
  // Normalize line endings + strip comments so the declaration regexes
  // behave identically on every OS/editor. (CRLF was a real-world bug.)
  let code = rawCode.replace(/\r\n?/g, '\n');
  // `export let x = …` marks a PROP (overridable from the import
  // placeholder). Record prop names, then treat as a normal declaration.
  const propNames = new Set();
  code = code.replace(
    /(^|[\n;{}])(\s*)export\s+(let|const|var)\s+([a-zA-Z_$][\w$]*)/g,
    (_, before, space, kw, name) => {
      propNames.add(name);
      return `${before}${space}${kw} ${name}`;
    },
  );
  // `$: doubled = count * 2;` — reactive statements.
  // Extracted here, re-run after every state change before patching.
  const reactiveStmts = [];
  code = code.replace(/(^|[\n;{}])(\s*)\$:\s*([^\n]+)/g, (_, before, space, stmt) => {
    reactiveStmts.push(stmt.trim().replace(/;\s*$/, ''));
    return `${before}${space}`;
  });

  const codeNoComments = code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  const raw = Object.create(null);

  // Seed every top-level declared identifier so the proxy `has` trap
  // claims it inside the with() block.
  const declRe = /(?:^|[\n;{}])\s*(?:let|const|var)\s+([a-zA-Z_$][\w$]*)/g;
  const funcRe =
    /(?:^|[\n;{}])\s*(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)/g;
  let m;
  while ((m = declRe.exec(codeNoComments)) !== null) raw[m[1]] = undefined;
  while ((m = funcRe.exec(codeNoComments)) !== null) raw[m[1]] = undefined;
  // `$: x = …` implicitly declares x
  for (const stmt of reactiveStmts) {
    const t = stmt.match(/^([a-zA-Z_$][\w$]*)\s*=[^=]/);
    if (t) raw[t[1]] = undefined;
  }

  // Rewrite declarations to bare assignments so they hit the proxy.
  let rewritten = code.replace(
    /(^|[\n;{}])(\s*)(async\s+)?function\s+([a-zA-Z_$][\w$]*)\s*\(/g,
    (_, before, space, async_ = '', name) =>
      `${before}${space}${name} = ${async_}function ${name}(`,
  );
  rewritten = rewritten.replace(
    /(^|[\n;{}])(\s*)(?:let|const|var)\s+([a-zA-Z_$][\w$]*)\s*=/g,
    (_, before, space, name) => `${before}${space}${name} =`,
  );
  // bare declarations without assignment: `let x;` → noop (already seeded)
  rewritten = rewritten.replace(
    /(^|[\n;{}])(\s*)(?:let|const|var)\s+([a-zA-Z_$][\w$]*)\s*(;|\n)/g,
    (_, before, space, _name, end) => `${before}${space}${end}`,
  );

  // Builtins available inside every component script.
  const scopeRef = { scope: null };
  const mountCallbacks = [];
  const builtins = {
    useStore: (name) => subscribeStore(name, componentEl, scopeRef),
    props: { ...props },
    // onMount(fn) — runs after the component is booted and painted.
    // A returned function is kept as a cleanup hook on the element.
    onMount: (fn) => mountCallbacks.push(fn),
  };

  const scope = new Proxy(raw, {
    has(target, key) {
      if (typeof key !== 'string') return false;
      if (Object.prototype.hasOwnProperty.call(builtins, key)) return true;
      // own-property check: stops window built-ins (name, status, length,
      // location…) from shadowing or escaping component state.
      return Object.prototype.hasOwnProperty.call(target, key);
    },
    get(target, key) {
      if (key === Symbol.unscopables) return undefined;
      if (Object.prototype.hasOwnProperty.call(builtins, key)) return builtins[key];
      return target[key];
    },
    set(target, key, value) {
      if (typeof key === 'symbol') {
        target[key] = value;
        return true;
      }
      target[key] = value;
      runReactive();
      patch(componentEl, scope);
      return true;
    },
  });

  scopeRef.scope = scope;
  componentEl.__sparkOnMount = mountCallbacks;

  // Re-run `$:` statements. Guarded so a reactive assignment doesn't
  // recurse into another full reactive pass; the patch after the outer
  // set sees the settled state.
  let inReactive = false;
  let ready = false; // don't run reactive stmts mid-initialization
  function runReactive() {
    if (!ready || inReactive || reactiveStmts.length === 0) return;
    inReactive = true;
    try {
      for (const stmt of reactiveStmts) {
        try {
          new Function('__scope__', `with(__scope__) { ${stmt} }`)(scope);
        } catch (e) {
          console.warn(`[spark] Error in "$: ${stmt}":`, e.message);
        }
      }
    } finally {
      inReactive = false;
    }
  }

  try {
    new Function('__scope__', `with(__scope__) { ${rewritten} }`)(scope);
    ready = true;
    // Props override `export let` defaults.
    for (const [key, value] of Object.entries(props)) {
      if (propNames.has(key)) raw[key] = value;
      else if (!Object.prototype.hasOwnProperty.call(raw, key)) raw[key] = value;
    }
    runReactive();
    patch(componentEl, scope);
  } catch (e) {
    console.warn(
      '[spark] Script error in',
      componentEl.getAttribute('name'),
      e,
    );
  }
  return scope;
}

// ─── DOM patching ──────────────────────────────────────────────────────
function patch(el, scope) {
  walkNode(el, scope, true);
}

function walkNode(node, scope, isRoot = false) {
  if (node.nodeType === Node.TEXT_NODE) {
    patchText(node, scope);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  // Escape hatch: subtrees marked spark-ignore are never patched —
  // essential for documentation/code samples containing literal {braces}.
  if (node.hasAttribute('spark-ignore')) return;
  // Don't reach into a nested component's territory.
  if (!isRoot && node.hasAttribute('name')) return;

  if (node.hasAttribute('each')) {
    patchEach(node, scope);
    return;
  }

  // <template if="expr"> — conditional block. Content is inserted after
  // the template when truthy, removed when falsy. Unlike :hidden, the
  // nodes genuinely leave the DOM.
  if (node.hasAttribute('if')) {
    patchIf(node, scope);
    return;
  }

  patchElement(node, scope);

  for (const child of [...node.childNodes]) {
    // A child may have been detached by patchEach earlier in this loop
    // (stale loop clones). Walking it with this scope would evaluate
    // loop bindings against the wrong scope and corrupt attributes —
    // and event.target may still reference that node.
    if (child.parentNode !== node) continue;
    walkNode(child, scope);
  }
}

function patchText(node, scope) {
  if (node.__sparkTpl === undefined) {
    node.__sparkTpl = node.textContent || '';
  }
  if (!node.__sparkTpl.includes('{')) return;
  const next = interpolate(node.__sparkTpl, scope);
  if (node.textContent !== next) node.textContent = next;
}

// ─── <template if="expr"> conditional blocks ──────────────────────────
function patchIf(el, scope) {
  if (!el.__sparkIfParsed) {
    el.__sparkIfExpr = el.getAttribute('if').trim();
    if (el.tagName.toLowerCase() === 'template') {
      el.__sparkIfTemplate = [...el.content.childNodes].map((n) =>
        n.cloneNode(true),
      );
    } else {
      el.__sparkIfTemplate = [...el.childNodes].map((n) => n.cloneNode(true));
      el.innerHTML = '';
    }
    el.__sparkIfParsed = true;
  }

  if (!el.parentNode) return;
  const show = Boolean(evaluate(el.__sparkIfExpr, scope));
  const isShown = Boolean(el.__sparkIfRendered && el.__sparkIfRendered.length);

  if (show && !isShown) {
    el.__sparkIfRendered = [];
    let insertAfter = el;
    el.__sparkIfTemplate.forEach((tpl) => {
      const clone = tpl.cloneNode(true);
      insertAfter.after(clone);
      insertAfter = clone;
      el.__sparkIfRendered.push(clone);
      walkNode(clone, scope, false);
    });
  } else if (!show && isShown) {
    el.__sparkIfRendered.forEach(
      (n) => n.parentNode && n.parentNode.removeChild(n),
    );
    el.__sparkIfRendered = [];
  } else if (show && isShown) {
    // keep contents fresh
    el.__sparkIfRendered.forEach((n) => {
      if (n.parentNode) walkNode(n, scope, false);
    });
  }
}

// ─── each="item in array" loops ───────────────────────────────────────
function patchEach(el, scope) {
  if (!el.__sparkEachParsed) {
    const expr = el.getAttribute('each').trim();
    const match = expr.match(/^(\w+)(?:\s*,\s*(\w+))?\s+in\s+(.+)$/);
    if (!match) {
      el.__sparkEachParsed = true;
      return;
    }

    el.__sparkEachVar = match[1];
    el.__sparkEachIndexVar = match[2] || null;
    el.__sparkEachArrayExpr = match[3].trim();

    if (el.tagName.toLowerCase() === 'template') {
      el.__sparkEachTemplate = [...el.content.childNodes].map((n) =>
        n.cloneNode(true),
      );
    } else {
      el.__sparkEachTemplate = [...el.childNodes].map((n) =>
        n.cloneNode(true),
      );
      el.innerHTML = '';
    }
    el.__sparkEachParsed = true;
  }

  const {
    __sparkEachVar: varName,
    __sparkEachIndexVar: idxName,
    __sparkEachArrayExpr: arrayExpr,
    __sparkEachTemplate: templateNodes,
  } = el;

  if (!varName || !arrayExpr || !templateNodes) return;
  if (!el.parentNode) return;

  const arr = evaluate(arrayExpr, scope);
  if (!Array.isArray(arr)) return;

  if (el.__sparkEachRendered) {
    el.__sparkEachRendered.forEach(
      (n) => n.parentNode && n.parentNode.removeChild(n),
    );
  }
  el.__sparkEachRendered = [];

  let insertAfter = el;
  arr.forEach((item, i) => {
    const loopScope = new Proxy(scope, {
      get(t, k) {
        if (k === varName) return item;
        if (idxName && k === idxName) return i;
        if (k === Symbol.unscopables) return undefined;
        return t[k];
      },
      has(t, k) {
        return k === varName || (idxName && k === idxName) || k in t;
      },
    });

    templateNodes.forEach((tpl) => {
      const clone = tpl.cloneNode(true);
      insertAfter.after(clone);
      insertAfter = clone;
      el.__sparkEachRendered.push(clone);
      walkNode(clone, loopScope, false);
    });
  });
}

// ─── Attribute / event bindings ───────────────────────────────────────
function patchElement(el, scope) {
  for (const attr of [...el.attributes]) {
    const { name, value } = attr;

    // bind:value="draft" / bind:checked="done" — two-way binding.
    // Reading: every patch pushes the scope value into the element.
    // Writing: input/change events push the element value into the scope.
    if (name === 'bind:value' || name === 'bind:checked') {
      const prop = name.slice(5); // 'value' | 'checked'
      const expr = value.trim();
      if (!el.__sparkBound) el.__sparkBound = new Set();
      if (!el.__sparkBound.has(name)) {
        el.__sparkBound.add(name);
        const eventName = prop === 'checked' ? 'change' : 'input';
        el.addEventListener(eventName, () => {
          // Simple identifiers and member paths both work:
          // bind:value="draft" / bind:value="form.email"
          execute(`${expr} = __val__`, scope, null, el[prop]);
        });
      }
      const current = evaluate(expr, scope);
      if (prop === 'checked') {
        const want = Boolean(current);
        if (el.checked !== want) el.checked = want;
      } else {
        const want = current == null ? '' : String(current);
        if (el.value !== want) el.value = want;
      }
      continue;
    }

    // onclick={handler}
    if (
      /^on\w+$/.test(name) &&
      value.startsWith('{') &&
      value.endsWith('}')
    ) {
      if (!el.__sparkEvents) el.__sparkEvents = new Set();
      if (!el.__sparkEvents.has(name)) {
        el.__sparkEvents.add(name);
        const fnExpr = value.slice(1, -1).trim();
        el.addEventListener(name.slice(2), (e) => {
          execute(`${fnExpr}(event)`, scope, e);
        });
        el.removeAttribute(name);
      }
      continue;
    }

    // :disabled="count >= 10"
    if (name.startsWith(':')) {
      const realAttr = name.slice(1);
      let result;
      try {
        result = new Function(
          '__scope__',
          `with(__scope__) { return (${value}) }`,
        )(scope);
      } catch {
        // Evaluation failed (e.g. a walker with the wrong scope reached a
        // loop clone). Leave the attribute untouched instead of blanking
        // it — event handlers may still need to read it.
        continue;
      }
      if (typeof result === 'boolean') {
        result
          ? el.setAttribute(realAttr, '')
          : el.removeAttribute(realAttr);
      } else {
        const str = String(result ?? '');
        if (el.getAttribute(realAttr) !== str)
          el.setAttribute(realAttr, str);
      }
      continue;
    }

    // value="{input}" interpolation in attributes
    if (value === undefined) { console.log('UNDEF ATTR:', name, 'on', el.tagName, JSON.stringify([...(el._attrs?.entries?.()||[])])); }
    // Interpolated attribute: value="{draft}". The template is cached on
    // first sight — the guard must check the CACHE, not the live value,
    // because after the first interpolation the live value has no braces
    // and the binding would go dead (the "input never clears" bug).
    const tpl =
      attr.__sparkTpl !== undefined
        ? attr.__sparkTpl
        : value.includes('{')
          ? value
          : undefined;
    if (tpl !== undefined) {
      attr.__sparkTpl = tpl;
      const next = interpolate(tpl, scope);
      if (attr.value !== next) el.setAttribute(name, next);
      // The value PROPERTY diverges from the attribute once the user has
      // typed — sync it independently so programmatic clears reach the UI.
      if (name === 'value' && 'value' in el && el.value !== next) {
        el.value = next;
      }
    }
  }
}

// ─── Component boot ───────────────────────────────────────────────────
function bootComponent(el) {
  if (el.__sparkBooted) return;
  el.__sparkBooted = true;

  const tag = el.getAttribute('name');

  // Script/style come from the SFC parser (preferred), or fall back to
  // legacy DOM children for old-style wrapped components.
  let scriptSrc = el.__sparkScriptSrc || '';
  let styleSrc = el.__sparkStyleSrc || '';

  const domScript = el.querySelector(':scope > script');
  const domStyle = el.querySelector(':scope > style');
  if (domScript) {
    scriptSrc = scriptSrc || domScript.textContent;
    domScript.remove();
  }
  if (domStyle) {
    styleSrc = styleSrc || domStyle.textContent;
    domStyle.remove();
  }

  if (styleSrc) {
    if (tag && !document.querySelector(`style[data-spark="${tag}"]`)) {
      const s = document.createElement('style');
      s.dataset.spark = tag;
      // Scope every selector to this component automatically.
      s.textContent = scopeCss(styleSrc, tag);
      document.head.appendChild(s);
    }
  }

  if (scriptSrc) {
    el.__sparkScope = makeScope(scriptSrc, el, el.__sparkProps || {});
  } else {
    el.__sparkScope = {};
    patch(el, el.__sparkScope);
  }

  requestAnimationFrame(() => {
    patch(el, el.__sparkScope);
    // onMount fires once, after the first paint-ready patch.
    (el.__sparkOnMount || []).forEach((fn) => {
      try {
        const cleanup = fn();
        if (typeof cleanup === 'function') {
          (el.__sparkOnDestroy ||= []).push(cleanup);
        }
      } catch (e) {
        console.warn('[spark] onMount error:', e.message);
      }
    });
    el.__sparkOnMount = [];
  });
}

// Prefix bare selectors with [name="comp"] for automatic scoping.
// `:global(...)` escapes scoping.
function scopeCss(css, tag) {
  return css.replace(
    /(^|\})\s*([^{}@]+)\s*\{/g,
    (full, brace, selectorList) => {
      const scoped = selectorList
        .split(',')
        .map((sel) => {
          sel = sel.trim();
          if (!sel) return sel;
          const globalMatch = sel.match(/^:global\((.+)\)$/);
          if (globalMatch) return globalMatch[1];
          return `[name="${tag}"] ${sel}`;
        })
        .join(', ');
      return `${brace}\n${scoped} {`;
    },
  );
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Mount Spark on a root element (default: document.body).
 * Resolves all [import] placeholders, then boots every component.
 *
 *   import { mount } from 'spark-html';
 *   mount();                         // whole document
 *   mount('#app');                   // a subtree
 *   mount(document.querySelector('#app'));
 *
 * Returns a promise that resolves when everything is booted.
 */
async function mount(root = document.body) {
  if (typeof root === 'string') root = document.querySelector(root);
  if (!root) throw new Error('[spark] mount target not found');

  const run = async () => {
    await resolveImports(root);
    root.querySelectorAll('[name]').forEach(bootComponent);
    if (root.hasAttribute && root.hasAttribute('name')) bootComponent(root);
    console.log(
      `[spark] ⚡ ready — ${root.querySelectorAll('[name]').length} component(s)`,
    );
  };

  if (document.readyState === 'loading') {
    await new Promise((res) =>
      document.addEventListener('DOMContentLoaded', res, { once: true }),
    );
  }
  return run();
}

/**
 * Register a component programmatically from a source string,
 * without fetching a file. Useful for tests and inline components.
 *
 *   component('hello', `<h1>Hi {who}</h1><script>let who='you'<\/script>`);
 *   // then in HTML: <div import="hello"></div> — or mount a node directly:
 */
const registry = new Map();

function component(name, source) {
  registry.set(name, source);
}

// Patch fetch path resolution: check the registry first.
const _origFetchComponent = async (path) => {
  const bare = path.replace(/\.html$/, '');
  if (registry.has(bare)) {
    return { ok: true, text: async () => registry.get(bare) };
  }
  return fetch(path);
};

export { mount, component, store, evaluate, interpolate, parseSFC };
export default { mount, component, store };
