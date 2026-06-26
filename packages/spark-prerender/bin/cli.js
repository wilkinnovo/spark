#!/usr/bin/env node
/**
 * spark-prerender CLI
 *
 *   spark-prerender <page.html> [more.html ...] [options]
 *
 * Prerenders each entry HTML file to fully-rendered, crawler-ready HTML.
 * Multi-page sites are an MPA — just list each page (no router). By default
 * each file is rewritten in place (intended for a post-build step over dist/);
 * pass --out <dir> to write copies elsewhere instead.
 *
 * Options:
 *   --out <dir>     Write output to <dir>/<basename> instead of in place.
 *   --root <dir>    Base dir for resolving import="components/x" (default: the
 *                   entry file's directory; also tries <root>/public, /dist).
 *   -h, --help      Show this help.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join, basename } from 'node:path';
import { prerender } from '../src/prerender.js';

function parseArgs(argv) {
  const entries = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--root') opts.root = argv[++i];
    else if (a.startsWith('--')) { console.error(`Unknown option: ${a}`); process.exit(2); }
    else entries.push(a);
  }
  return { entries, opts };
}

const HELP = `spark-prerender — SEO prerender for spark-html

Usage:
  spark-prerender <page.html> [more.html ...] [--out <dir>] [--root <dir>]

Examples:
  spark-prerender dist/index.html dist/docs.html
  spark-prerender site/index.html --out build --root site
`;

async function main() {
  const { entries, opts } = parseArgs(process.argv.slice(2));
  if (opts.help || entries.length === 0) {
    process.stdout.write(HELP);
    process.exit(entries.length === 0 && !opts.help ? 2 : 0);
  }

  let failures = 0;
  for (const entry of entries) {
    const entryAbs = resolve(entry);
    try {
      const html = await prerender(entryAbs, { root: opts.root });
      const dest = opts.out
        ? join(resolve(opts.out), basename(entryAbs))
        : entryAbs;
      if (opts.out) await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, html, 'utf8');
      const bytes = Buffer.byteLength(html);
      console.log(`✓ ${entry} → ${opts.out ? dest : 'in place'} (${bytes} bytes)`);
    } catch (e) {
      failures++;
      console.error(`✗ ${entry} — ${e.message}`);
    }
  }
  process.exit(failures ? 1 : 0);
}

main();
