/**
 * Vite plugin for Spark.
 *
 *   // vite.config.js
 *   import { defineConfig } from 'vite';
 *   import spark from 'spark-html/vite';
 *
 *   export default defineConfig({ plugins: [spark()] });
 *
 * What it does:
 *  - Serves component .html fragments raw (skips Vite's HTML entry
 *    transform, which would inject HMR client code into fragments)
 *  - Full-page reload when a component file changes
 */
export default function spark(options = {}) {
  const dir = options.componentsDir ?? 'components';

  return {
    name: 'spark',

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.includes(`/${dir}/`) && req.url.endsWith('.html')) {
          res.setHeader('Content-Type', 'text/html');
        }
        next();
      });
    },

    handleHotUpdate({ file, server }) {
      if (file.includes(`/${dir}/`) && file.endsWith('.html')) {
        server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
  };
}
