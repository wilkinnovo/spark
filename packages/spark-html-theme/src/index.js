/**
 * spark-html-theme — dark / light / system theming in one line.
 *
 * Replaces the boilerplate every site re-writes (a theme store, applying a
 * `data-theme` attribute, watching the OS preference, persisting to
 * localStorage, and a toggle). Call once in your bootstrap:
 *
 *   import { theme } from 'spark-html-theme';
 *   theme();
 *
 * It creates a reactive `theme` store any component can read and drive:
 *
 *   <span class="logo" onclick="{theme.toggle}"></span>
 *   <script>
 *     const theme = useStore('theme');   // { mode, resolved, toggle, set }
 *     $: label = theme.resolved;          // 'light' | 'dark'
 *   </script>
 *
 * `mode` is the user's choice ('system' | 'light' | 'dark'); `resolved` is what
 * actually applies ('light' | 'dark'); `toggle()` cycles through `modes`;
 * `set(mode)` jumps to one. The chosen `resolved` is written to
 * `document.documentElement` as `data-theme`.
 *
 * No-flash tip: a deferred module runs after first paint, so to avoid a flash of
 * the wrong theme add this tiny inline script to <head> (it mirrors the same
 * logic) — or import { themeInitScript } and inline its string:
 *
 *   <script>document.documentElement.dataset.theme =
 *     (localStorage.getItem('theme-mode')||'system')==='light' ? 'light'
 *     : (localStorage.getItem('theme-mode')==='dark' ||
 *        matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
 *   </script>
 */
import { store } from 'spark-html';

const DEFAULT_MODES = ['system', 'light', 'dark'];

/**
 * Set up theming. Returns the reactive `theme` store proxy.
 *
 * @param {object} [options]
 * @param {string} [options.key='theme-mode']   localStorage key for the mode.
 * @param {string} [options.attribute='data-theme'] Attribute written on <html>.
 * @param {string[]} [options.modes]             Cycle order for toggle()
 *                                               (default ['system','light','dark']).
 * @param {string} [options.name='theme']        Store name.
 */
export function theme(options = {}) {
  const key = options.key || 'theme-mode';
  const attribute = options.attribute || 'data-theme';
  const modes = options.modes || DEFAULT_MODES;
  const name = options.name || 'theme';

  const mq = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null;
  const read = () => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (v) => { try { localStorage.setItem(key, v); } catch { /* ignore */ } };

  const saved = read();
  const initial = saved && modes.includes(saved) ? saved : modes[0];
  const resolve = (mode) => (mode === 'system' ? (mq && mq.matches ? 'dark' : 'light') : mode);

  function apply() {
    s.resolved = resolve(s.mode);
    const root = typeof document !== 'undefined' && document.documentElement;
    if (root) root.setAttribute(attribute, s.resolved);
  }
  function set(mode) {
    if (!modes.includes(mode)) return;
    s.mode = mode;
    write(mode);
    apply();
  }
  function toggle() {
    set(modes[(modes.indexOf(s.mode) + 1) % modes.length]);
  }

  const s = store(name, { mode: initial, resolved: resolve(initial), toggle, set });

  apply();
  if (mq && mq.addEventListener) mq.addEventListener('change', apply);
  return s;
}

/**
 * The inline no-flash snippet as a string, to drop into <head> (sets the
 * `data-theme` attribute before first paint). Keep `key`/`attribute` in sync
 * with theme().
 */
export function themeInitScript({ key = 'theme-mode', attribute = 'data-theme' } = {}) {
  return (
    `(function(){try{var m=localStorage.getItem(${JSON.stringify(key)})||'system';` +
    `var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);` +
    `document.documentElement.setAttribute(${JSON.stringify(attribute)},d?'dark':'light');}` +
    `catch(e){document.documentElement.setAttribute(${JSON.stringify(attribute)},'dark');}})();`
  );
}

export default { theme, themeInitScript };
