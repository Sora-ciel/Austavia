// The guide's screenshots (utils/guideBlock.js), taken from the app itself.
//
// Asked 2026-11-22: one block that explains everything "with screens inside
// showing how everything works". Taken by a script rather than by hand so
// they can be taken again whenever the app changes: `npm run guide:shots`,
// then look at public/guide/ before committing.
//
// It starts its own dev server, opens the app in a fresh browser -- which
// makes the newcomer folder, as a new device does -- and photographs each
// mode and panel at a computer's size and a phone's.
//
// Needs Chromium (/snap/bin/chromium, or CHROMIUM=...) and ImageMagick
// (`magick`) for the WebP files. OUT=<dir> writes elsewhere, for a look first.

import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const CHROMIUM = process.env.CHROMIUM || '/snap/bin/chromium';
const PORT = 5176;
const URL = `http://localhost:${PORT}/`;
const OUT = process.env.OUT || 'public/guide';
const RAW = join(OUT, '.raw');

const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'dev', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'inherit']
});
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('vite did not start')), 60000);
  vite.on('exit', code => { clearTimeout(timer); reject(new Error(`vite exited (${code}) -- is port ${PORT} taken?`)); });
  vite.stdout.on('data', chunk => {
    if (String(chunk).includes('Local:')) { clearTimeout(timer); resolve(); }
  });
});

mkdirSync(RAW, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

/** A device: a fresh browser at this size, the app open in the newcomer folder. */
async function device({ width, height, phone = false }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    ...(phone ? { isMobile: true, hasTouch: true } : {}),
    colorScheme: 'dark'
  });
  const page = await context.newPage();
  page.on('pageerror', error => console.log(`  page error: ${error.message}`));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForSelector('.app', { timeout: 180000 });
  await pause(2500);
  await closeSettings(page);
  return { context, page };
}

/** The settings panel starts open on a fresh computer; closed for the shots. */
async function closeSettings(page) {
  await page.evaluate(() => { const d = document.querySelector('.right-controls details'); if (d) d.open = false; });
  await pause(300);
}
async function openSettings(page) {
  await page.evaluate(() => { const d = document.querySelector('.right-controls details'); if (d) d.open = true; });
  await pause(500);
}

/** The app reopened in a mode, as it opens in the mode last used. */
async function inMode(page, mode) {
  await page.evaluate(m => localStorage.setItem('lastMode', m), mode);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.app', { timeout: 60000 });
  await pause(2000);
  await closeSettings(page);
}

/** The calendar scrolled to eight in the morning. */
async function morning(page) {
  await page.evaluate(() => {
    const scroller = [...document.querySelectorAll('.app *')].find(el => el.scrollHeight > el.clientHeight * 1.5 && /(auto|scroll)/.test(getComputedStyle(el).overflowY));
    if (scroller) scroller.scrollTop = scroller.scrollHeight * (7.5 / 24);
  });
  await pause(400);
}

const shots = [];
async function shoot(page, name) {
  const file = join(RAW, `${name}.png`);
  await page.screenshot({ path: file });
  shots.push(name);
  console.log(`  ${name}`);
}

try {
  // A computer.
  const pc = await device({ width: 1280, height: 800 });
  for (const mode of ['default', 'simple', 'single', 'page', 'task', 'calendar', 'habit', 'playlist']) {
    await inMode(pc.page, mode);
    // The calendar opens at the time it is now; the morning has the events.
    if (mode === 'calendar') await morning(pc.page);
    await shoot(pc.page, `pc-${mode}`);
  }
  await inMode(pc.page, 'page');
  await pc.page.locator('[data-control="mode"] button').first().click();
  await pause(500);
  await shoot(pc.page, 'pc-mode-picker');
  await inMode(pc.page, 'default');
  await pc.page.locator('[data-control="addBlock"] button').first().click();
  await pause(500);
  await shoot(pc.page, 'pc-add-block');
  await inMode(pc.page, 'page');
  await openSettings(pc.page);
  await shoot(pc.page, 'pc-settings');
  await pc.page.evaluate(() => {
    const heading = [...document.querySelectorAll('.right-controls h4')].find(h => /style presets/i.test(h.textContent));
    heading?.scrollIntoView({ block: 'start' });
  });
  await pause(400);
  await shoot(pc.page, 'pc-themes');
  await pc.page.getByRole('button', { name: /Create custom theme/ }).click();
  await pause(800);
  await shoot(pc.page, 'pc-custom-theme');
  await pc.context.close();

  // A phone.
  const phone = await device({ width: 390, height: 844, phone: true });
  for (const mode of ['page']) {
    await inMode(phone.page, mode);
    await shoot(phone.page, `phone-${mode}`);
  }
  await phone.context.close();
} finally {
  await browser.close();
  vite.kill();
}

// WebP, a third the size of PNG for screens like these, and no wider than 1600.
for (const name of shots) {
  // 1600 across: twice what a block shows them at, so still sharp.
  execFileSync('magick', [join(RAW, `${name}.png`), '-resize', '1600x>', '-quality', '82', join(OUT, `${name}.webp`)]);
}
if (!process.env.KEEP_RAW) rmSync(RAW, { recursive: true, force: true });
console.log(`${shots.length} screens in ${OUT}`);
