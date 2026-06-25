/**
 * Type definitions for the Spark Vite plugin (`spark-html/vite`).
 */

export interface SparkViteOptions {
  /**
   * Directory (under the served root) that holds component `.html` fragments.
   * Files matched here are served raw — Vite's HTML entry transform is skipped
   * so it doesn't inject HMR client code into fragments. Default: `'components'`.
   */
  componentsDir?: string;
}

/**
 * Minimal structural shape of the returned Vite plugin. Typed loosely so the
 * package carries no hard dependency on Vite's own types; assignable to Vite's
 * `Plugin` where it's used.
 */
export interface SparkVitePlugin {
  name: string;
  configureServer(server: unknown): void;
  handleHotUpdate(ctx: unknown): unknown[] | void;
}

/**
 * Vite plugin for Spark: serves component `.html` fragments raw and triggers a
 * full-page reload when a component file changes.
 *
 * ```ts
 * // vite.config.js
 * import { defineConfig } from 'vite';
 * import spark from 'spark-html/vite';
 *
 * export default defineConfig({ plugins: [spark()] });
 * ```
 */
export default function spark(options?: SparkViteOptions): SparkVitePlugin;
