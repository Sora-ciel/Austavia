/**
 * Moves an element out to the app's root while it is shown -- a Svelte
 * action, `use:portal`.
 *
 * For a pop-up opened from inside a block on the Canvas. The Canvas is zoomed
 * with a CSS transform, and inside a transformed parent `position: fixed`
 * stops meaning "fixed to the screen": the pop-up is drawn scaled and in the
 * wrong place. Moved to `.app` rather than to <body>, so it keeps the theme's
 * colours, which are set on `.app` (--app-*, --dlg-*).
 *
 * The colour field had this inline; the task block's goal menu needed it too
 * (2026-10-27), so it lives here -- CLAUDE.md, "One of everything".
 */
export function portal(node, target) {
  const host = target || (typeof document !== 'undefined' && (document.querySelector('.app') || document.body));
  if (host) host.appendChild(node);
  return {
    destroy() {
      if (node.parentNode) node.parentNode.removeChild(node);
    }
  };
}
