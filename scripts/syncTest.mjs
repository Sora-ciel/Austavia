// Two devices against the local Firebase emulator: the sync tests.
//
// Asked 2026-11-12: "instead of having to do it myself every time how about
// we make it so that you can do those tests". Sync faults only exist between
// two devices, and every one so far was found by Sora with a phone in one hand
// and the PC in front. This opens Austavia twice -- two browser profiles, so
// two devices with their own storage -- signs both into one test account that
// exists only in the emulator, and plays what happened to Sora.
//
// Run with `npm run test:sync` (it starts the emulator around this). Needs
// Chromium (/snap/bin/chromium, or CHROMIUM=...), and the internet for the
// Firebase scripts the app loads. Staging stays for finding bugs by using the
// app; this is for checking a fix.
//
// The devices act through window.__austaviaTest (App.svelte), which exists
// only in an emulator build and goes through the same functions a person's
// edits and the sync timers do.

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright-core';

const PORT = 5175;
const URL = `http://localhost:${PORT}/`;
const CHROMIUM = process.env.CHROMIUM || '/snap/bin/chromium';

// Vite itself rather than through npx, so stopping it stops the server.
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'dev', '--mode', 'emulator', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'inherit']
});
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('vite did not start')), 60000);
  vite.on('exit', code => { clearTimeout(timer); reject(new Error(`vite exited (${code}) -- is port ${PORT} taken?`)); });
  vite.stdout.on('data', chunk => {
    if (String(chunk).includes('Local:')) { clearTimeout(timer); resolve(); }
  });
});

// A fresh account each run, so nothing a run leaves in the emulator can
// decide the next one.
const ACCOUNT = `sync-test-${Date.now().toString(36)}`;

const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
let failures = 0;

async function device(name) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', error => console.log(`  [${name}] page error: ${error.message}`));
  // The first visit is slow: Vite prepares the whole app for it.
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__austaviaTest, null, { timeout: 180000 });
  await page.evaluate(id => window.__austaviaTest.signIn(id), ACCOUNT);
  await page.waitForFunction(() => window.__austaviaTest.ready(), null, { timeout: 60000 });
  await page.evaluate(() => window.__austaviaTest.manual());
  const call = (fn, ...args) => page.evaluate(([f, a]) => window.__austaviaTest[f](...a), [fn, args]);
  return {
    name,
    page,
    context,
    folders: () => call('folders'),
    read: folder => call('read', folder),
    write: (folder, payload) => call('write', folder, payload),
    rename: (from, to) => call('rename', from, to),
    upload: () => call('upload'),
    pull: () => call('pull'),
    log: () => call('log'),
    async relaunch() {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__austaviaTest?.ready(), null, { timeout: 60000 });
      await page.evaluate(() => window.__austaviaTest.manual());
    },
    base: folder => call('base', folder)
  };
}

const task = (id, items) => ({ id, type: 'task', tasks: items.map((text, i) => ({ id: `${id}-${i}`, text, done: false })) });
const note = (id, content) => ({ id, type: 'text', content });
const folderOf = blocks => ({ blocks, modeSettings: {}, modeOrders: {} });

// Both devices start from the same folder, as after a normal sync.
async function shared(phone, computer, folder) {
  await phone.write(folder, folderOf([task('t', ['first']), note('n', '<p>hello</p>')]));
  await phone.upload();
  await computer.pull();
  const there = await computer.folders();
  if (!there.includes(folder)) throw new Error(`"${folder}" never reached the computer`);
}

const copiesOf = async (dev, folder) => (await dev.folders()).filter(name => name.startsWith(`${folder} (from`));
const tasksIn = payload => payload.blocks.find(b => b.id === 't')?.tasks.map(t => t.text);
const noteIn = payload => payload.blocks.find(b => b.id === 'n')?.content;

async function scenario(title, run) {
  try {
    await run();
    console.log(`ok      ${title}`);
  } catch (error) {
    failures += 1;
    console.log(`FAILED  ${title}\n        ${error.message}`);
  }
}

function expect(actual, wanted, what) {
  const a = JSON.stringify(actual);
  const w = JSON.stringify(wanted);
  if (a !== w) throw new Error(`${what}: got ${a}, wanted ${w}`);
}

try {
  const phone = await device('phone');
  const computer = await device('computer');

  await scenario('a task added on the phone and a note edited on the computer are merged, with no copy', async () => {
    const folder = 'Different blocks';
    await shared(phone, computer, folder);
    await phone.write(folder, folderOf([task('t', ['first', 'from phone']), note('n', '<p>hello</p>')]));
    await phone.upload();
    await computer.write(folder, folderOf([task('t', ['first']), note('n', '<p>hello from computer</p>')]));
    await computer.upload(); // finds the cloud moved: merges
    await computer.upload(); // and sends the merge
    await phone.pull();
    expect(await copiesOf(computer, folder), [], 'copies on the computer');
    for (const dev of [computer, phone]) {
      const got = await dev.read(folder);
      expect(tasksIn(got), ['first', 'from phone'], `${dev.name}'s tasks`);
      expect(noteIn(got), '<p>hello from computer</p>', `${dev.name}'s note`);
    }
  });

  await scenario('the same block changed on both makes a copy, and the folder takes the other device\'s', async () => {
    const folder = 'Same block';
    await shared(phone, computer, folder);
    await phone.write(folder, folderOf([task('t', ['first', 'phone']), note('n', '<p>hello</p>')]));
    await phone.upload();
    await computer.write(folder, folderOf([task('t', ['first', 'computer']), note('n', '<p>hello</p>')]));
    await computer.upload();
    const copies = await copiesOf(computer, folder);
    expect(copies.length, 1, 'copies on the computer');
    expect(tasksIn(await computer.read(folder)), ['first', 'phone'], 'the folder');
    expect(tasksIn(await computer.read(copies[0])), ['first', 'computer'], 'the copy');
  });

  await scenario('a rename and back on the computer, never uploaded, then an edit on the phone: no copy', async () => {
    const folder = 'Renamed';
    await shared(phone, computer, folder);
    await computer.rename(folder, `${folder} test`);
    await computer.rename(`${folder} test`, folder);
    // Closed before its upload went: the next launch is where it meets the phone's.
    await computer.relaunch();
    await phone.write(folder, folderOf([task('t', ['first', 'from phone']), note('n', '<p>hello</p>')]));
    await phone.upload();
    await computer.relaunch();
    // SYNC_DEBUG=1 prints both versions of a copy made where none should be.
    if (process.env.SYNC_DEBUG) {
      for (const name of await copiesOf(computer, folder)) {
        console.log('copy  ', JSON.stringify((await computer.read(name)).blocks));
        console.log('folder', JSON.stringify((await computer.read(folder)).blocks));
      }
    }
    expect(await copiesOf(computer, folder), [], 'copies on the computer');
    expect(tasksIn(await computer.read(folder)), ['first', 'from phone'], 'the computer\'s tasks');
  });

  await scenario('edits on both while the computer is offline: merged when it comes back', async () => {
    const folder = 'Offline';
    await shared(phone, computer, folder);
    await computer.context.setOffline(true);
    await computer.write(folder, folderOf([task('t', ['first']), note('n', '<p>written offline</p>')]));
    await phone.write(folder, folderOf([task('t', ['first', 'from phone']), note('n', '<p>hello</p>')]));
    await phone.upload();
    await computer.context.setOffline(false);
    await sleep(2000);
    await computer.upload();
    await computer.upload();
    await phone.pull();
    expect(await copiesOf(computer, folder), [], 'copies on the computer');
    const got = await phone.read(folder);
    expect(tasksIn(got), ['first', 'from phone'], 'the phone\'s tasks');
    expect(noteIn(got), '<p>written offline</p>', 'the phone\'s note');
  });

  if (failures) {
    console.log('\nThe computer\'s sync log, last 60:');
    for (const e of (await computer.log()).slice(-60)) console.log(`  ${e.kind} [${e.folder}] ${e.message}`);
  }
} finally {
  await browser.close();
  vite.kill();
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
