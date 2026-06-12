import { defineConfig } from 'vite';
import spark from 'spark-html/vite';

export default defineConfig({
  plugins: [spark()],
});
