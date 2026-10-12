import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  signInMethod,
  signInRequest,
  readSignInAnswer,
  handlerAddress,
  randomCode,
  authSetup
} from '../src/utils/desktopSignIn.js';

// Wanted, 2026-10-09: sign-in working on the Linux app, and then "better to have
// it in app instead of opening another browser". So Linux (and macOS) sign in
// in a window of the app's own; Windows keeps the popup it has always used.

const LINUX_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko)';
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/140.0';
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';

const CLIENT = '921907824188-example.apps.googleusercontent.com';
const DOMAIN = 'arial-473c1.firebaseapp.com';

function token(payload) {
  const part = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${part}.signature`;
}

test('the Linux desktop app signs in in a window of its own, not a browser', () => {
  assert.equal(signInMethod({ isTauri: true, userAgent: LINUX_UA }), 'window');
});

test('the macOS desktop app does too', () => {
  assert.equal(signInMethod({ isTauri: true, userAgent: MAC_UA }), 'window');
});

test('the Windows desktop app keeps the popup it has always used', () => {
  assert.equal(signInMethod({ isTauri: true, userAgent: WINDOWS_UA }), 'popup');
});

test('a browser tab uses the popup, and the phone its own picker', () => {
  assert.equal(signInMethod({ userAgent: LINUX_UA }), 'popup');
  assert.equal(signInMethod({ isCapacitorNative: true, userAgent: LINUX_UA }), 'native');
});

test('the window asks Google for an ID token for the web client, sent to the Firebase handler', () => {
  const { url, redirect } = signInRequest({ clientId: CLIENT, authDomain: DOMAIN, state: 's1', nonce: 'n1' });
  const asked = new URL(url);
  assert.equal(asked.origin + asked.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(asked.searchParams.get('client_id'), CLIENT);
  assert.equal(asked.searchParams.get('response_type'), 'id_token');
  assert.equal(asked.searchParams.get('redirect_uri'), `https://${DOMAIN}/__/auth/handler`);
  assert.equal(asked.searchParams.get('state'), 's1');
  assert.equal(asked.searchParams.get('nonce'), 'n1');
  assert.equal(redirect, handlerAddress(DOMAIN));
});

test('the account picker is always offered, so a second account can be reached', () => {
  const { url } = signInRequest({ clientId: CLIENT, authDomain: DOMAIN, state: 's', nonce: 'n' });
  assert.equal(new URL(url).searchParams.get('prompt'), 'select_account');
});

test('without a web client there is no sign-in to open', () => {
  assert.throws(() => signInRequest({ clientId: '', authDomain: DOMAIN, state: 's', nonce: 'n' }), /web client/);
});

test('the answer for this sign-in gives its ID token', () => {
  const idToken = token({ nonce: 'n1', email: 'a@example.com' });
  const address = `${handlerAddress(DOMAIN)}#state=s1&id_token=${idToken}&authuser=0`;
  assert.equal(readSignInAnswer(address, { state: 's1', nonce: 'n1' }), idToken);
});

test('an answer with another sign-in\'s state is refused', () => {
  const address = `${handlerAddress(DOMAIN)}#state=other&id_token=${token({ nonce: 'n1' })}`;
  assert.throws(() => readSignInAnswer(address, { state: 's1', nonce: 'n1' }), /not for this sign-in/);
});

test('a token minted for another sign-in is refused, even with the right state', () => {
  const address = `${handlerAddress(DOMAIN)}#state=s1&id_token=${token({ nonce: 'someone-elses' })}`;
  assert.throws(() => readSignInAnswer(address, { state: 's1', nonce: 'n1' }), /not for this sign-in/);
});

test('Google saying no is reported in words', () => {
  assert.throws(
    () => readSignInAnswer(`${handlerAddress(DOMAIN)}#error=access_denied&state=s1`, { state: 's1', nonce: 'n1' }),
    /cancelled/
  );
  assert.throws(
    () => readSignInAnswer(`${handlerAddress(DOMAIN)}?error=invalid_request`, { state: 's1', nonce: 'n1' }),
    /refused the sign-in \(invalid_request\)/
  );
});

test('an answer with no token is refused', () => {
  assert.throws(() => readSignInAnswer(`${handlerAddress(DOMAIN)}#state=s1`, { state: 's1', nonce: 'n1' }), /ID token/);
});

test('each random code is long and different', () => {
  const a = randomCode();
  const b = randomCode();
  assert.equal(a.length, 48);
  assert.notEqual(a, b);
});

// The window sign-in came back with a good token and then hung, because
// Firebase's popup helper never finished starting in the Linux app and the
// sign-in waited behind it (measured: getAuth never ready, initializeAuth
// without the helper ready in 1ms). See authSetup.
test('the Linux app starts Firebase without the popup helper its sign-in waited on for ever', () => {
  assert.equal(authSetup('window'), 'without-popup-helper');
});

test('everywhere that signs in with a popup or the phone picker keeps the standard setup', () => {
  assert.equal(authSetup('popup'), 'standard');
  assert.equal(authSetup('native'), 'standard');
});
