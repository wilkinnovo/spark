/**
 * spark-prerender/vite — run the prerender automatically as part of
 * `vite build`, over the emitted `dist/*.html`.
 *
 *   // vite.config.js
 *   import spark from 'spark-html/vite';
 *   import prerender from 'spark-prerender/vite';
 *
 *   export default {
 *     plugins: [
 *       spark(),
 *       prerender({ pages: ['index.html', 'docs.html'] }),
 *     ],
 *   };
 *
 * Runs in `closeBundle` (after assets are written), rewriting each page in
 * place. A failed page logs and is skipped — the build still succeeds with
 * the un-prerendered (client-rendered) HTML, so SEO degrades gracefully and
 * never breaks the build.
 */
import { resolve, join, dirname } from 'node:path';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { prerender, routesOf, routeToFile, redirectsFor, vercelConfigFor, NOT_FOUND_ROUTE } from './prerender.js';

/**
 * @param {object} [options]
 * @param {string[]} [options.pages=['index.html']] HTML files in the out dir to prerender.
 * @param {object}   [options.prerender] Options forwarded to prerender() (e.g. fetch, meta).
 */
export default function sparkPrerender(options = {}) {
  const pages = options.pages || ['index.html'];
  let outDir = 'dist';
  let projectRoot = process.cwd();
  return {
    name: 'spark-prerender',
    apply: 'build',
    configResolved(config) {
      if (config && config.build && config.build.outDir) outDir = config.build.outDir;
      if (config && config.root) projectRoot = config.root;
    },
    async closeBundle() {
      const root = resolve(outDir);
      for (const page of pages) {
        const file = join(root, page);
        try {
          // A routed page (spark-html-router) expands to one file per route +
          // host rewrite rules.
          const routes = routesOf(await readFile(file, 'utf8'));
          if (routes.length) {
            const all = routes.includes('/') ? routes : ['/', ...routes];
            // Render every route from the ORIGINAL entry first, then write —
            // the "/" route's output IS this entry file, so writing mid-loop
            // would clobber the source the remaining routes re-read (leaking
            // the home route into about.html etc.).
            const rendered = [];
            for (const route of all) {
              rendered.push([routeToFile(route), await prerender(file, { root, route, projectRoot, ...(options.prerender || {}) })]);
            }
            // 404.html — GitHub Pages (and most static hosts) serve it for any
            // unknown path, so no manual generate-404 build step is needed. A
            // user-provided one always wins: skip if the build already emitted
            // a 404.html (e.g. from public/) or the app declares a /404 route.
            if (!existsSync(join(root, '404.html')) && !all.some((r) => routeToFile(r) === '404.html')) {
              rendered.push(['404.html', await prerender(file, { root, route: NOT_FOUND_ROUTE, projectRoot, ...(options.prerender || {}) })]);
            }
            for (const [name, out] of rendered) {
              const dest = join(root, name);
              await mkdir(dirname(dest), { recursive: true });
              await writeFile(dest, out, 'utf8');
            }
            // _redirects ships in the publish dir (Netlify reads it from the
            // deployed output); vercel.json must live at the PROJECT ROOT —
            // Vercel reads it from the repo, not the build output, so a copy
            // under dist/ is silently ignored.
            await writeFile(join(root, '_redirects'), redirectsFor(all), 'utf8');
            await writeFile(join(resolve(projectRoot), 'vercel.json'), vercelConfigFor(all), 'utf8');
            console.log(`[spark-prerender] prerendered ${all.length} routes from ${page} (+ dist/_redirects, vercel.json)`);
            continue;
          }
          const html = await prerender(file, { root, projectRoot, ...(options.prerender || {}) });
          await writeFile(file, html, 'utf8');
          console.log(`[spark-prerender] prerendered ${page}`);
        } catch (e) {
          console.warn(`[spark-prerender] skipped ${page} — ${e.message}`);
        }
      }
    },
  };
}
