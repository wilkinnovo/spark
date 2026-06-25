/**
 * Ambient builtins available INSIDE a Spark component `<script>` block — no
 * import needed (Spark injects them into each component's scope).
 *
 * These are only meaningful within `.html` component scripts, which TS does
 * not type-check on its own. Opt in from your project (e.g. a `globals.d.ts`)
 * if you author component scripts in a TS-aware setup:
 *
 *   /// <reference types="spark-html/globals" />
 */

declare global {
  /**
   * Subscribe this component to a named store and return its reactive proxy.
   * The store must have been created with `store(name, initial)` before mount.
   */
  function useStore<T extends object = Record<string, unknown>>(name: string): T;

  /**
   * Register a callback to run after the component is mounted and painted.
   * Returning a function keeps it as a cleanup hook, run when the component is
   * destroyed (removed by an `each`/`if`, or via `unmount`).
   */
  function onMount(fn: () => void | (() => void)): void;

  /**
   * The props passed to this component from its `import` placeholder's
   * attributes. Prefer `export let name = …` for individual declared props.
   */
  const props: Record<string, unknown>;
}

export {};
