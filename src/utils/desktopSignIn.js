/**
 * Google sign-in on the Linux desktop app, in a window of the app's own.
 *
 * ## What was asked for
 *
 * First, on 2026-10-09: "Austavia works [on Linux], though the sign in thing
 * doesn't work." Then, the same day, after it was made to work through the
 * system browser: "it's better to have it in app instead of opening another
 * browser, because it doesn't do the link between the two well." So the
 * sign-in happens in a small window of the app, and no browser is involved.
 *
 * ## Why the Windows way cannot work here
 *
 * On Windows the app calls `signInWithPopup` and WebView2 opens the popup. On
 * Linux WebKitGTK opens no popup window (Tauri does not handle its `create`
 * signal), and Firebase will not run a popup or redirect from a `tauri://`
 * page anyway — only from http(s). macOS's webview has the same two
 * properties, so it goes this way too.
 *
 * ## How
 *
 * The app opens Google's OpenID sign-in page itself, in a window of its own
 * (src-tauri/src/sign_in_window.rs), asking for an ID token for the project's
 * web client — the same client the Android app already signs in with — to be
 * sent to the project's Firebase auth handler. That handler is registered for
 * the web client by Firebase, which is why Google accepts it. The window never
 * loads it: Rust catches the address as Google sends the window there and
 * hands it back here. The ID token in it then signs in to Firebase exactly as
 * Android's does.
 *
 * Two random values make sure the token is the one this sign-in asked for:
 * `state` comes back beside the token, and `nonce` comes back inside it.
 */

export const SIGN_IN_EVENT = 'sign-in-window';

/**
 * How this copy of the app should sign in to Google.
 *
 * - `native`: the Android app, through the platform account picker.
 * - `window`: the Linux and macOS desktop app, in a sign-in window of its own.
 * - `popup`: everything else — a browser tab, and the Windows desktop app.
 */
export function signInMethod({ isCapacitorNative = false, isTauri = false, userAgent = '' } = {}) {
  if (isCapacitorNative) return 'native';
  if (isTauri && !/Windows/i.test(userAgent)) return 'window';
  return 'popup';
}

/**
 * How Firebase's account system should be set up for a given sign-in method.
 *
 * The window sign-in reached Google, came back with a good token, and then
 * hung: signInWithCredential never answered, and after 30s Firebase called it
 * a network failure. Measured inside the real Linux app, the network was
 * fine — the same request with a fake token was refused in under half a
 * second — but `getAuth()` never finished starting up (authStateReady still
 * waiting after 12s), and a sign-in records its user only once start-up is
 * done. The same app with `initializeAuth()` and no popup/redirect helper was
 * ready in 1ms.
 *
 * The helper is what `getAuth()` adds for signInWithPopup and
 * signInWithRedirect. Firebase starts it eagerly on anything that looks like
 * Safari, which WebKitGTK's user agent does, and from a `tauri://` page it
 * never reports ready. The window sign-in uses neither popup nor redirect, so
 * there it is left out. Everywhere else it is what the sign-in uses, so it
 * stays.
 */
export function authSetup(method) {
  return method === 'window' ? 'without-popup-helper' : 'standard';
}

/** Where Google is asked to send the answer: Firebase's own auth handler. */
export function handlerAddress(authDomain) {
  return `https://${authDomain}/__/auth/handler`;
}

/** A random value for `state` or `nonce`. */
export function randomCode(random = (bytes) => crypto.getRandomValues(bytes)) {
  const bytes = random(new Uint8Array(24));
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** The address the sign-in window opens, and the one it will end on. */
export function signInRequest({ clientId, authDomain, state, nonce }) {
  if (!clientId) throw new Error('Google sign-in is not configured for this app (missing web client ID).');
  const redirect = handlerAddress(authDomain);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'id_token',
    scope: 'openid email profile',
    state,
    nonce,
    // Always offer the account picker, as the popup does, so a second
    // account can be reached.
    prompt: 'select_account'
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, redirect };
}

function decodeTokenPayload(idToken) {
  const part = String(idToken).split('.')[1];
  if (!part) return null;
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  try {
    const text = typeof atob === 'function'
      ? decodeURIComponent(escape(atob(base64)))
      : Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * The ID token from the address the sign-in window ended on, once it is sure
 * the answer belongs to this sign-in. Throws with a readable message otherwise.
 */
export function readSignInAnswer(address, { state, nonce }) {
  const url = new URL(address);
  // Google puts the answer in the fragment; an error can come as a query.
  const answer = new URLSearchParams(url.hash.replace(/^#/, '') || url.search);
  const error = answer.get('error');
  if (error) {
    throw new Error(error === 'access_denied' ? 'Sign-in was cancelled.' : `Google refused the sign-in (${error}).`);
  }
  if (answer.get('state') !== state) {
    throw new Error('That sign-in answer was not for this sign-in. Please try again.');
  }
  const idToken = answer.get('id_token');
  if (!idToken) throw new Error('Google did not return an ID token.');
  if (decodeTokenPayload(idToken)?.nonce !== nonce) {
    throw new Error('That sign-in answer was not for this sign-in. Please try again.');
  }
  return idToken;
}
