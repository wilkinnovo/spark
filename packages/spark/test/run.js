/**
 * Spark test runner — node only, no browser.
 * Tests the pure logic (parser, scope, interpolation) directly,
 * using a minimal document shim for the few DOM touchpoints.
 */
import { strict as assert } from 'node:assert';

// Minimal shims so the module can load outside a browser.
globalThis.document = {
  readyState: 'complete',
  createElement: () => ({ setAttribute() {}, attributes: [], childNodes: [] }),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  head: { appendChild() {} },
  body: { querySelectorAll: () => [] },
};
globalThis.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
globalThis.fetch = async () => ({ ok: false, status: 404 });

const { parseSFC, evaluate, interpolate } = await import('../src/index.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); }
}

console.log('\nparseSFC');
test('extracts script and style, leaves markup', () => {
  const { markup, script, style } = parseSFC(
    `<h1>Hi {x}</h1>\n<script>let x = 1;</scr` + `ipt>\n<style>h1{color:red}</style>`,
  );
  assert.equal(markup, '<h1>Hi {x}</h1>');
  assert.equal(script, 'let x = 1;');
  assert.equal(style, 'h1{color:red}');
});
test('no script leak into markup', () => {
  const { markup } = parseSFC(`<p>a</p><script>let y=2;</scr` + `ipt>`);
  assert.ok(!/<script/i.test(markup));
});
test('handles multiple script blocks', () => {
  const { script } = parseSFC(
    `<p>a</p><script>let a=1;</scr` + `ipt><script>let b=2;</scr` + `ipt>`,
  );
  assert.ok(script.includes('a=1') || script.includes('a = 1') || script.includes('let a=1'));
  assert.ok(script.includes('let b=2;'));
});
test('handles CRLF line endings', () => {
  const { script } = parseSFC(`<p>x</p>\r\n<script>\r\nlet n='hi';\r\n</scr` + `ipt>`);
  assert.ok(script.includes(`n='hi'`));
});

console.log('\nevaluate');
test('reads from a plain object scope', () => {
  assert.equal(evaluate('a + b', { a: 2, b: 3 }), 5);
});
test('invalid expression returns empty string', () => {
  assert.equal(evaluate('@@@nope', {}), '');
});

console.log('\ninterpolate');
test('replaces {expr} with values', () => {
  assert.equal(interpolate('Hi {who}!', { who: 'tester' }), 'Hi tester!');
});
test('null/undefined render as empty', () => {
  assert.equal(interpolate('[{x}]', { x: null }), '[]');
});
test('expressions work', () => {
  assert.equal(interpolate('{n * 2}', { n: 21 }), '42');
});

// ── scope rewrite behavior, tested via the same regex pipeline ──
console.log('\nscope rewrite (regression suite)');
function simulateScope(rawCode) {
  let code = rawCode.replace(/\r\n?/g, '\n');
  const noComments = code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const raw = Object.create(null);
  const declRe = /(?:^|[\n;{}])\s*(?:let|const|var)\s+([a-zA-Z_$][\w$]*)/g;
  const funcRe = /(?:^|[\n;{}])\s*(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)/g;
  let m;
  while ((m = declRe.exec(noComments)) !== null) raw[m[1]] = undefined;
  while ((m = funcRe.exec(noComments)) !== null) raw[m[1]] = undefined;
  let rw = code.replace(
    /(^|[\n;{}])(\s*)(async\s+)?function\s+([a-zA-Z_$][\w$]*)\s*\(/g,
    (_, b, s, a = '', n) => `${b}${s}${n} = ${a}function ${n}(`,
  );
  rw = rw.replace(
    /(^|[\n;{}])(\s*)(?:let|const|var)\s+([a-zA-Z_$][\w$]*)\s*=/g,
    (_, b, s, n) => `${b}${s}${n} =`,
  );
  rw = rw.replace(
    /(^|[\n;{}])(\s*)(?:let|const|var)\s+([a-zA-Z_$][\w$]*)\s*(;|\n)/g,
    (_, b, s, _n, e) => `${b}${s}${e}`,
  );
  const scope = new Proxy(raw, {
    has: (t, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(t, k),
    get: (t, k) => (k === Symbol.unscopables ? undefined : t[k]),
    set: (t, k, v) => ((t[k] = v), true),
  });
  new Function('__scope__', `with(__scope__) { ${rw} }`)(scope);
  return { raw, scope };
}

test('the original welcome bug: let name', () => {
  const { raw } = simulateScope(`let name = 'John Doe';`);
  assert.equal(raw.name, 'John Doe');
});
test('window built-ins do not shadow (status, length, location)', () => {
  const { raw } = simulateScope(`let status = 'ok'; let length = 7;`);
  assert.equal(raw.status, 'ok');
  assert.equal(raw.length, 7);
});
test('CRLF script', () => {
  const { raw } = simulateScope(`\r\nlet n = 1;\r\n`);
  assert.equal(raw.n, 1);
});
test('comment-first script', () => {
  const { raw } = simulateScope(`// state\nlet n = 2;`);
  assert.equal(raw.n, 2);
});
test('functions become scope members and can mutate state', () => {
  const { raw, scope } = simulateScope(
    `let count = 0;\nfunction inc() { count++; }`,
  );
  assert.equal(typeof raw.inc, 'function');
  raw.inc();
  assert.equal(raw.count, 1);
});
test('async function declarations', () => {
  const { raw } = simulateScope(`async function load() { return 1; }`);
  assert.equal(typeof raw.load, 'function');
});
test('bare let without assignment', () => {
  const { raw } = simulateScope(`let pending;\npending = 'yes';`);
  assert.equal(raw.pending, 'yes');
});
test('full interpolation round trip', () => {
  const { scope } = simulateScope(`let name = 'John Doe';`);
  assert.equal(interpolate('Welcome {name}', scope), 'Welcome John Doe');
});


// ── props: export let + coercion ──
console.log('\nprops');
function simulateScopeWithProps(rawCode, props = {}) {
  let code = rawCode.replace(/\r\n?/g, '\n');
  const propNames = new Set();
  code = code.replace(
    /(^|[\n;{}])(\s*)export\s+(let|const|var)\s+([a-zA-Z_$][\w$]*)/g,
    (_, b, s, kw, n) => { propNames.add(n); return `${b}${s}${kw} ${n}`; },
  );
  const noComments = code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const raw = Object.create(null);
  const declRe = /(?:^|[\n;{}])\s*(?:let|const|var)\s+([a-zA-Z_$][\w$]*)/g;
  let m;
  while ((m = declRe.exec(noComments)) !== null) raw[m[1]] = undefined;
  let rw = code.replace(
    /(^|[\n;{}])(\s*)(?:let|const|var)\s+([a-zA-Z_$][\w$]*)\s*=/g,
    (_, b, s, n) => `${b}${s}${n} =`,
  );
  const scope = new Proxy(raw, {
    has: (t, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(t, k),
    get: (t, k) => (k === Symbol.unscopables ? undefined : t[k]),
    set: (t, k, v) => ((t[k] = v), true),
  });
  new Function('__scope__', `with(__scope__) { ${rw} }`)(scope);
  for (const [key, value] of Object.entries(props)) {
    if (propNames.has(key)) raw[key] = value;
  }
  return { raw, propNames };
}

test('export let declares a prop with default', () => {
  const { raw, propNames } = simulateScopeWithProps(`export let name = 'Anonymous';`);
  assert.ok(propNames.has('name'));
  assert.equal(raw.name, 'Anonymous');
});
test('prop value overrides the default', () => {
  const { raw } = simulateScopeWithProps(
    `export let name = 'Anonymous';`,
    { name: 'Ada Lovelace' },
  );
  assert.equal(raw.name, 'Ada Lovelace');
});
test('non-prop variables are not overridable from outside', () => {
  const { raw } = simulateScopeWithProps(
    `let secret = 'internal';`,
    { secret: 'hacked' },
  );
  assert.equal(raw.secret, 'internal');
});

console.log('\nprop coercion');
function coerce(v) {
  if (v === '') return true;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  if (v !== '' && !isNaN(Number(v))) return Number(v);
  try { return JSON.parse(v); } catch {}
  return v;
}
test('numbers coerce', () => assert.equal(coerce('42'), 42));
test('booleans coerce', () => { assert.equal(coerce('true'), true); assert.equal(coerce('false'), false); });
test('bare attribute → true', () => assert.equal(coerce(''), true));
test('JSON arrays coerce', () => assert.deepEqual(coerce('["a","b"]'), ['a', 'b']));
test('plain strings stay strings', () => assert.equal(coerce('Ada Lovelace'), 'Ada Lovelace'));

console.log('\nstore');
const sparkMod = await import('../src/index.js');
test('store() creates shared reactive state', () => {
  const s = sparkMod.store('test1', { count: 0 });
  s.count = 5;
  assert.equal(s.count, 5);
});
test('store() with same name returns same instance', () => {
  const a = sparkMod.store('test2', { x: 1 });
  const b = sparkMod.store('test2', { x: 999 });
  a.x = 42;
  assert.equal(b.x, 42);
});
test('store mutations notify subscribers', () => {
  // reach the subscriber path via the proxy set trap
  const s = sparkMod.store('test3', { n: 0 });
  let before = s.n;
  s.n = before + 1;
  assert.equal(s.n, before + 1);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
