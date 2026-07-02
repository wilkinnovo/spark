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
 *   --out <dir>          Write output to <dir>/<basename> instead of in place.
 *   --root <dir>         Base dir for resolving import="components/x" (default:
 *                        the entry file's dir; also tries <root>/public, /dist).
 *   --vercel-root <dir>  Where to write vercel.json (default: cwd). Vercel reads
 *                        its config from the project root, not the build output.
 *   --site <url>         Deployed origin (https://example.com). Enables
 *                        sitemap.xml + the Sitemap: line in robots.txt.
 *   -h, --help           Show this help.
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { prerender, routesOf, routeToFile, redirectsFor, vercelConfigFor, NOT_FOUND_ROUTE, noindexRoutesOf, sitemapFor, robotsFor } from '../src/prerender.js';

function parseArgs(argv) {
  const entries = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--root') opts.root = argv[++i];
    else if (a === '--vercel-root') opts.vercelRoot = argv[++i];
    else if (a === '--site') opts.site = argv[++i];
    else if (a.startsWith('--')) { console.error(`Unknown option: ${a}`); process.exit(2); }
    else entries.push(a);
  }
  return { entries, opts };
}

const HELP = `spark-prerender — SEO prerender for spark-html

Usage:
  spark-prerender <page.html> [more.html ...] [--out <dir>] [--root <dir>] [--vercel-root <dir>] [--site <url>]

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
    const outDir = opts.out ? resolve(opts.out) : dirname(entryAbs);
    try {
      // A routed entry (spark-html-router) expands to one file per route.
      const source = await readFile(entryAbs, 'utf8');
      const routes = routesOf(source);
      if (routes.length) {
        const all = routes.includes('/') ? routes : ['/', ...routes];
        // Render every route from the ORIGINAL entry first, then write — the
        // "/" route's output file IS the entry, so writing mid-loop would
        // clobber the source the remaining routes re-read.
        const rendered = [];
        for (const route of all) {
          rendered.push([route, routeToFile(route), await prerender(entryAbs, { root: opts.root, route })]);
        }
        // 404.html — served by GitHub Pages (and most static hosts) for any
        // unknown path. A user-provided one wins: skip if it already exists in
        // the out dir or the app declares a /404 route.
        if (!existsSync(join(outDir, '404.html')) && !all.some((r) => routeToFile(r) === '404.html')) {
          rendered.push(['(catch-all)', '404.html', await prerender(entryAbs, { root: opts.root, route: NOT_FOUND_ROUTE })]);
        }
        for (const [route, name, html] of rendered) {
          const dest = join(outDir, name);
          await mkdir(dirname(dest), { recursive: true });
          await writeFile(dest, html, 'utf8');
          console.log(`✓ ${entry} [${route}] → ${name} (${Buffer.byteLength(html)} bytes)`);
        }
        // _redirects ships in the publish dir (Netlify reads it from the
        // deployed output); vercel.json must live at the PROJECT ROOT — Vercel
        // reads it from the repo, not the build output, so a copy under the out
        // dir is silently ignored. Default to cwd; override with --vercel-root.
        const vercelRoot = opts.vercelRoot ? resolve(opts.vercelRoot) : process.cwd();
        await writeFile(join(outDir, '_redirects'), redirectsFor(all), 'utf8');
        await writeFile(join(vercelRoot, 'vercel.json'), vercelConfigFor(all), 'utf8');
        console.log(`✓ wrote _redirects (${outDir}) + vercel.json (${vercelRoot}) — ${all.length} routes`);
        // sitemap.xml (needs --site for absolute URLs) + robots.txt. noindex
        // routes are excluded/disallowed; existing files are never overwritten.
        const noindex = noindexRoutesOf(source);
        if (opts.site && !existsSync(join(outDir, 'sitemap.xml'))) {
          const indexable = all.filter((r) => !noindex.includes(r));
          await writeFile(join(outDir, 'sitemap.xml'), sitemapFor(indexable, opts.site), 'utf8');
          console.log(`✓ wrote sitemap.xml — ${indexable.length} URLs`);
        }
        if (!existsSync(join(outDir, 'robots.txt'))) {
          await writeFile(join(outDir, 'robots.txt'), robotsFor({ site: opts.site, noindex }), 'utf8');
          console.log('✓ wrote robots.txt');
        }
        continue;
      }

      const html = await prerender(entryAbs, { root: opts.root });
      const dest = opts.out ? join(outDir, basename(entryAbs)) : entryAbs;
      if (opts.out) await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, html, 'utf8');
      console.log(`✓ ${entry} → ${opts.out ? dest : 'in place'} (${Buffer.byteLength(html)} bytes)`);
    } catch (e) {
      failures++;
      console.error(`✗ ${entry} — ${e.message}`);
    }
  }
  process.exit(failures ? 1 : 0);
}

main();
