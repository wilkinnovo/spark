/** End-to-end tests for bind:, $:, onMount, and <template if> */
import './dom-shim.js';
import { body, parseHTML } from './dom-shim.js';
import { strict as assert } from 'node:assert';

const { mount, component } = await import('../src/index.js');

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); }
}
const tick = () => new Promise(r => setTimeout(r, 5));
function fire(el, type) {
  const e = { type, target: el };
  (el._listeners[type] || []).forEach(fn => fn(e));
}

// ── bind:value ──
component('bindtest', `
<input bind:value="draft" />
<p class="echo">{draft}</p>
<button onclick="{clear}">clear</button>
<script>
  let draft = 'initial';
  function clear() { draft = ''; }
</script>
`);

// ── reactive statements ──
component('reactivetest', `
<p class="out">{doubled} / {label}</p>
<button onclick="{inc}">+</button>
<script>
  let count = 3;
  $: doubled = count * 2;
  $: label = count > 4 ? 'big' : 'small';
  function inc() { count++; }
</script>
`);

// ── onMount ──
component('mounttest', `
<p class="status">{status}</p>
<script>
  let status = 'pending';
  onMount(() => { status = 'mounted'; });
</script>
`);

// ── template if ──
component('iftest', `
<button onclick="{toggle}">toggle</button>
<template if="show"><p class="secret">revealed</p></template>
<script>
  let show = false;
  function toggle() { show = !show; }
</script>
`);

parseHTML(
  '<div import="bindtest"></div><div import="reactivetest"></div><div import="mounttest"></div><div import="iftest"></div>',
  body,
);
await mount();
await tick();

console.log('\nbind:value');
await test('initial scope value pushed into input', () => {
  const input = body.querySelector('[name="bindtest"] input');
  assert.equal(input.value, 'initial');
});
await test('typing flows element → scope → text', async () => {
  const input = body.querySelector('[name="bindtest"] input');
  input.value = 'typed!';
  fire(input, 'input');
  await tick();
  const echo = body.querySelector('[name="bindtest"] .echo');
  assert.equal(echo.childNodes[0].textContent, 'typed!');
});
await test('scope write flows back into the input (clearing works)', async () => {
  const btn = body.querySelector('[name="bindtest"] button');
  fire(btn, 'click');
  await tick();
  const input = body.querySelector('[name="bindtest"] input');
  assert.equal(input.value, '');
});

console.log('\n$: reactive statements');
await test('derived values computed on init', () => {
  const out = body.querySelector('[name="reactivetest"] .out');
  assert.equal(out.childNodes[0].textContent.trim(), '6 / small');
});
await test('derived values recompute on change', async () => {
  const btn = body.querySelector('[name="reactivetest"] button');
  fire(btn, 'click'); // count 4
  fire(btn, 'click'); // count 5
  await tick();
  const out = body.querySelector('[name="reactivetest"] .out');
  assert.equal(out.childNodes[0].textContent.trim(), '10 / big');
});

console.log('\nonMount');
await test('runs after boot and can set state', () => {
  const st = body.querySelector('[name="mounttest"] .status');
  assert.equal(st.childNodes[0].textContent, 'mounted');
});

console.log('\n<template if>');
await test('hidden when falsy', () => {
  assert.equal(body.querySelector('[name="iftest"] .secret'), null);
});
await test('inserted when truthy', async () => {
  fire(body.querySelector('[name="iftest"] button'), 'click');
  await tick();
  const el = body.querySelector('[name="iftest"] .secret');
  assert.ok(el, 'element should exist');
  assert.equal(el.childNodes[0].textContent, 'revealed');
});
await test('removed again when falsy', async () => {
  fire(body.querySelector('[name="iftest"] button'), 'click');
  await tick();
  assert.equal(body.querySelector('[name="iftest"] .secret'), null);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
