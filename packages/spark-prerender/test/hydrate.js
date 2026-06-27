/**
 * Hydration: the prerendered HTML is re-resolvable by a client `mount()`.
 *
 * We prerender a fixture, then load the OUTPUT into a fresh client DOM, run
 * the real client `mount()` over it, and assert it takes over correctly —
 * rendered content stays, the page is interactive, and nothing blanks.
 */
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { prerender } from '../src/prerender.js';

const here = dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); }
}

console.log('\nspark-prerender — hydration');

// 1) Prerender the metadata fixture.
const out = await prerender(join(here, 'fixture', 'index.html'));

await test('output keeps top-level hosts as re-resolvable [import] placeholders', () => {
  // <div ... import="components/app.html" name="app" ...> with rendered content
  assert.ok(/import="components\/app\.html"/.test(out), 'app host has import path');
  assert.ok(out.includes('My Tasks'), 'rendered content present for crawlers');
});

await test('hydratable:false produces pure-static output (no import on hosts)', async () => {
  const stat = await prerender(join(here, 'fixture', 'index.html'), { hydratable: false });
  assert.ok(!/import="components\/app/.test(stat), 'no import placeholder when disabled');
  assert.ok(stat.includes('My Tasks'), 'still rendered');
});

// 2) Now simulate a CLIENT taking over the prerendered HTML.
//    Fresh DOM + the real client runtime; components served from the same
//    fixture dir via a fetch shim.
await test('a client mount() over the prerendered HTML renders (no blank)', async () => {
  // Load a fresh dom-shim and the runtime in an isolated module graph.
  const shim = await import('../../spark/test/dom-shim.js');
  const { body } = shim;
  // Serve component files from disk to the client fetch.
  const compDir = join(here, 'fixture', 'components');
  globalThis.fetch = async (path) => {
    const rel = String(path).replace(/^.*components\//, '').replace(/[?#].*$/, '');
    try {
      const text = readFileSync(join(compDir, rel), 'utf8');
      return { ok: true, status: 200, text: async () => text };
    } catch {
      return { ok: false, status: 404, text: async () => '' };
    }
  };

  // Put the prerendered BODY content into the client document body.
  const bodyInner = out.replace(/[\s\S]*<body[^>]*>/i, '').replace(/<\/body>[\s\S]*/i, '');
  body.innerHTML = bodyInner;

  const spark = await import('../../spark/src/index.js');
  await spark.mount(body);
  await new Promise((r) => setTimeout(r, 20)); // let imports resolve + boot

  // The client re-resolved the placeholder and rendered the real component.
  const app = body.querySelector('[name="app"]');
  assert.ok(app, 'app host present after client mount');
  const text = app.textContent;
  assert.ok(text.includes('My Tasks'), 'heading rendered by client (not blank)');
  assert.ok(text.includes('Write parser'), 'each rendered by client');
  assert.ok(!text.includes('{heading}'), 'no raw template braces left');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
