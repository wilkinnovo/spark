import { defineConfig } from 'vite';
import { resolve } from 'path';
import spark from 'spark-html/vite';

// On GitHub Pages the site is served from /<repo-name>/, not /.
// The deploy workflow sets BASE_PATH; locally it defaults to '/'.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [spark()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        docs: resolve(__dirname, 'docs.html'),
      },
    },
  },
});
