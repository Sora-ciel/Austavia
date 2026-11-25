// Typing on the phone, measured on the phone (PENDING, "Typing on the phone").
// The staging app plugged in over USB and its DevTools socket forwarded:
//   adb forward tcp:9333 localabstract:webview_devtools_remote_$(adb shell pidof com.sora.austavia.staging)
// then: node scripts/phoneBench.mjs phone <photos> [compose]   (or 'desk' for a local dev server).
// Opens ?bench=hold in the app, types through the browser's text input as a
// keyboard does, and prints letter-to-screen times. Its test note and photos
// are deleted after.
import { chromium } from 'playwright-core';
const where = process.argv[2] || 'desk';
let browser, page;
if (where === 'phone') {
  browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  page = browser.contexts()[0].pages()[0];
  await page.evaluate(n => { location.href = '/?bench=hold&pictures=' + n; }, process.argv[3] || 0).catch(() => {});
  await page.waitForLoadState('domcontentloaded');
} else {
  browser = await chromium.launch({ executablePath: '/snap/bin/chromium', headless: true });
  page = await (await browser.newContext({ viewport: { width: 400, height: 800 }, isMobile: true, hasTouch: true })).newPage();
  await page.goto('http://localhost:5173/?bench=hold&pictures=' + (process.argv[3] || 0), { timeout: 120000 });
}
await page.waitForFunction(() => window.__benchHold?.ready, null, { timeout: 180000, polling: 500 });
const cdp = await page.context().newCDPSession(page);
const sent = [];
const composing = process.argv[4] === 'compose';
const words = ['quick', 'brown', 'foxes', 'jumped', 'over', 'lazy', 'dogs', 'today'];
let n = 0;
for (const word of words) {
  for (let i = 1; i <= word.length; i++) {
    const t = Date.now();
    if (composing) await cdp.send('Input.imeSetComposition', { text: word.slice(0, i), selectionStart: i, selectionEnd: i });
    else await cdp.send('Input.insertText', { text: word[i - 1] });
    sent.push(Date.now() - t);
    n++;
    await new Promise(r => setTimeout(r, 150));
  }
  await cdp.send('Input.insertText', { text: composing ? word + ' ' : ' ' });
  await new Promise(r => setTimeout(r, 150));
}
await new Promise(r => setTimeout(r, 1500));
await page.evaluate(() => { window.__benchRelease = true; });
await page.waitForFunction(() => window.__benchResult, null, { timeout: 60000, polling: 500 });
const r = await page.evaluate(() => window.__benchResult);
console.log(JSON.stringify({ where, pictures: r.pictures, openMs: r.openMs, chars: r.chars, ready: r.ready, inputToFrameMs: r.inputToFrameMs, composing, sendRoundTripMedianMs: sent.sort((a, b) => a - b)[Math.floor(sent.length / 2)] }));
if (where === 'phone') await page.evaluate(() => { location.href = '/'; }).catch(() => {});
await browser.close().catch(() => {});
