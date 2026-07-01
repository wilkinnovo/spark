import { defineConfig } from 'vite';
import spark from 'spark-html/vite';
import prerender from 'spark-prerender/vite';

export default defineConfig({
  plugins: [
    spark(),
    prerender({ pages: ['index.html'] }),
  ],
});
