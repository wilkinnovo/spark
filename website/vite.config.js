import { defineConfig } from 'vite';
import { resolve } from 'path';
import spark from 'spark-html/vite';

export default defineConfig({
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
