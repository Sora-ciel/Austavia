/**
 * Payment pages open in the system browser on the desktop app.
 *
 * ## Why
 *
 * Found on 2026-10-12, while putting Polar live: "Upgrade to Pro" and "Manage
 * subscription" are `<a target="_blank">` links, which is right on the web and
 * on Android (Capacitor hands an outside link to the system browser) and wrong
 * on both desktop builds:
 *
 * - **Linux**: WebKitGTK opens no window for `target="_blank"` (Tauri does not
 *   handle its `create` signal), so the Upgrade button did nothing at all.
 * - **Windows**: WebView2 opens the checkout in a bare popup of its own, with
 *   no address bar, which is not where anybody should be typing a card number
 *   and has none of the browser's saved cards or password manager either.
 *
 * So on the desktop app those links go to the system browser instead, through
 * `open_in_browser` in src-tauri. Only Polar's own pages are let through: the
 * command exists to open a payment page, not to be a general way for the page
 * to start programs.
 */

/** Whether links that leave the app should be handed to the system browser. */
export function opensInSystemBrowser({ isTauri = false } = {}) {
  return isTauri;
}

/** Polar's checkout and customer portal, and nothing else. */
export function isAllowedExternalUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false;
  const host = parsed.hostname.toLowerCase();
  return host === 'polar.sh' || host.endsWith('.polar.sh');
}

function currentlyTauri() {
  return typeof window !== 'undefined' && !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

async function invokeTauri(command, args) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(command, args);
}

/**
 * Click handler for a payment link. Leaves the click alone where the link
 * already does the right thing; on the desktop app opens it in the browser.
 * `isTauri` and `invoke` are only passed by tests.
 */
export async function openPaymentLink(event, url, { isTauri = currentlyTauri(), invoke = invokeTauri } = {}) {
  if (!opensInSystemBrowser({ isTauri })) return false;
  event?.preventDefault?.();
  if (!isAllowedExternalUrl(url)) return false;
  await invoke('open_in_browser', { url });
  return true;
}
