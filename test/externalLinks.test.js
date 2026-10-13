import { test } from 'node:test';
import assert from 'node:assert/strict';

import { opensInSystemBrowser, isAllowedExternalUrl, openPaymentLink } from '../src/utils/externalLinks.js';

// Found while putting Polar live (2026-10-12): on the Linux app "Upgrade to
// Pro" did nothing, and on Windows the checkout opened in a bare popup with no
// address bar. Payment pages go to the system browser on the desktop app.

const CHECKOUT = 'https://buy.polar.sh/polar_cl_abc?reference_id=uid123';
const PORTAL = 'https://polar.sh/austavia/portal';

test('on the desktop app the checkout opens in the system browser', async () => {
  const calls = [];
  let prevented = false;
  const event = { preventDefault: () => { prevented = true; } };
  const opened = await openPaymentLink(event, CHECKOUT, {
    isTauri: true,
    invoke: async (command, args) => calls.push({ command, args })
  });
  assert.equal(opened, true);
  assert.equal(prevented, true);
  assert.deepEqual(calls, [{ command: 'open_in_browser', args: { url: CHECKOUT } }]);
});

test('on the web and the phone the link is left to do what it already does', async () => {
  let prevented = false;
  const opened = await openPaymentLink({ preventDefault: () => { prevented = true; } }, CHECKOUT, {
    isTauri: false,
    invoke: async () => { throw new Error('must not be called'); }
  });
  assert.equal(opened, false);
  assert.equal(prevented, false);
  assert.equal(opensInSystemBrowser({ isTauri: false }), false);
});

test('Polar checkout and portal pages are let through', () => {
  assert.equal(isAllowedExternalUrl(CHECKOUT), true);
  assert.equal(isAllowedExternalUrl(PORTAL), true);
  assert.equal(isAllowedExternalUrl('https://sandbox.polar.sh/austavia/portal'), true);
  assert.equal(isAllowedExternalUrl('https://api.polar.sh/v1/checkout-links/x/redirect'), true);
});

test('nothing else can be opened through it', () => {
  assert.equal(isAllowedExternalUrl('http://polar.sh/austavia/portal'), false);
  assert.equal(isAllowedExternalUrl('https://polar.sh.evil.example/portal'), false);
  assert.equal(isAllowedExternalUrl('https://evilpolar.sh/portal'), false);
  assert.equal(isAllowedExternalUrl('https://user:pass@polar.sh/'), false);
  assert.equal(isAllowedExternalUrl('file:///etc/passwd'), false);
  assert.equal(isAllowedExternalUrl('not a url'), false);
});

test('a link that is not Polar\'s is not opened, and not followed inside the app either', async () => {
  let prevented = false;
  const opened = await openPaymentLink({ preventDefault: () => { prevented = true; } }, 'https://example.com', {
    isTauri: true,
    invoke: async () => { throw new Error('must not be called'); }
  });
  assert.equal(opened, false);
  assert.equal(prevented, true);
});
