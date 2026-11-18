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

// Warm the server up before any device opens it: after a code change it
// compiles the whole app on the first visit, and the first device's own
// timeouts used to run out waiting for that (2026-11-17, twice in a row).
async function warmUp() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(URL);
      if (res.ok) {
        await fetch(new globalThis.URL('/src/main.js', URL)).catch(() => {});
        return;
      }
    } catch { /* not listening yet */ }
    await sleep(1000);
  }
  throw new Error('the dev server never answered');
}
await warmUp();

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
  await page.waitForFunction(() => window.__austaviaTest.ready(), null, { timeout: 180000 });
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
    show: (folder, mode) => call('show', folder, mode),
    storePicture: dataUrl => call('storePicture', dataUrl),
    scrollOf: selector => call('scrollOf', selector),
    scrollTo: (selector, top) => call('scrollTo', selector, top),
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

  await scenario('a page open and scrolled on the computer stays where it was when the phone\'s change arrives', async () => {
    const folder = 'Long page';
    const long = Array.from({ length: 40 }, (_, i) => note(`p${i}`, `<p>Line ${i}</p><p>more</p><p>and more</p>`));
    // Page mode shows the blocks its layout lists, one per row here.
    const onPage = blocks => ({ ...folderOf(blocks), modeSettings: { page: { rows: blocks.map(b => ({ cells: [{ blockId: b.id }] })) } } });
    await phone.write(folder, onPage(long));
    await phone.upload();
    await computer.pull();
    await computer.show(folder, 'page');
    await sleep(800);
    const set = await computer.scrollTo('.page-mode', 900);
    if (!(set > 0)) {
      const seen = await computer.page.evaluate(() => {
        const el = document.querySelector('.page-mode');
        return el ? `${el.scrollHeight}/${el.clientHeight} blocks:${el.querySelectorAll('[data-block-id]').length} text:${el.innerText.slice(0, 80)}` : `no .page-mode; modes:${document.querySelector('.modes')?.className}`;
      });
      throw new Error(`the page could not be scrolled (got ${set}; ${seen})`);
    }
    await phone.write(folder, onPage([...long.slice(0, 39), note('p39', '<p>changed on the phone</p>')]));
    await phone.upload();
    // As the app does: the pull steps aside while the computer has its own
    // save unsent (opening a folder re-saves it), and the upload that follows
    // merges the phone's change in and draws the page again.
    await computer.pull();
    await computer.upload();
    await sleep(800);
    const remounts = (await computer.log()).filter(e => e.folder === folder && /merged|taking it/.test(e.message)).length;
    if (remounts < 2) throw new Error('the phone\'s change was never taken in, so nothing was drawn again');
    const after = await computer.scrollOf('.page-mode');
    if (Math.abs(after - set) > 4) throw new Error(`the page scrolled from ${set} to ${after}`);
    const got = await computer.read(folder);
    expect(noteIn({ blocks: got.blocks.map(b => (b.id === 'p39' ? { ...b, id: 'n' } : b)) }), '<p>changed on the phone</p>', 'the change arrived');
  });

  await scenario('a picture kept by reference on the computer reaches the phone as a picture', async () => {
    const folder = 'Picture by reference';
    const dataUrl = await computer.page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 40; c.height = 20;
      const g = c.getContext('2d'); g.fillStyle = '#3e63dd'; g.fillRect(0, 0, 40, 20);
      return c.toDataURL('image/png');
    });
    const ref = await computer.storePicture(dataUrl);
    if (!/^austavia-picture:/.test(ref || '')) throw new Error(`no reference: ${ref}`);
    await computer.write(folder, folderOf([note('n', `<p>a picture</p><p><img src="${ref}"></p>`)]));
    await computer.upload();
    await phone.pull();
    const there = noteIn(await phone.read(folder)) || '';
    if (there.includes('austavia-picture:')) throw new Error('the phone got the reference, which means nothing there');
    const link = (there.match(/src="([^"]+)"/) || [])[1] || '';
    if (!/^https?:\/\//.test(link)) throw new Error(`the phone got no link: ${there.slice(0, 120)}`);
    const shown = await phone.page.evaluate(async src => { const r = await fetch(src.replace(/&amp;/g, '&')); return r.ok ? (await r.blob()).size : -r.status; }, link);
    if (!(shown > 0)) throw new Error(`the phone could not fetch the picture (${shown})`);
    const here = noteIn(await computer.read(folder)) || '';
    if (!here.includes(ref)) throw new Error('the computer\'s own copy lost its reference');
  });

  await scenario('a folder renamed on the phone while the computer added a task to it: one folder, both tasks', async () => {
    // Reported 2026-11-17: "Home" renamed to "A Home" on the phone, the PC's
    // tasks in "Home" lost -- the rename looked like a delete there.
    await shared(phone, computer, 'Home');
    await phone.rename('Home', 'A Home');
    // Edited as the app edits: its settings, the folder's id with them, kept.
    const renamed = await phone.read('A Home');
    await phone.write('A Home', { ...renamed, blocks: [task('t', ['first', 'from phone']), note('n', '<p>hello</p>')] });
    await phone.upload();
    await phone.upload(); // the old name's delete goes once the new name is up
    await computer.write('Home', folderOf([task('t', ['first']), note('n', '<p>hello from computer</p>')]));
    await computer.pull();
    const folders = await computer.folders();
    if (folders.includes('Home')) throw new Error(`"Home" is still on the computer: ${folders.join(', ')}`);
    if (!folders.includes('A Home')) throw new Error(`no "A Home" on the computer: ${folders.join(', ')}`);
    expect(await copiesOf(computer, 'A Home'), [], 'copies on the computer');
    const got = await computer.read('A Home');
    expect(tasksIn(got), ['first', 'from phone'], 'the computer\'s tasks');
    expect(noteIn(got), '<p>hello from computer</p>', 'the computer\'s note');
    await computer.upload();
    await phone.pull();
    expect(noteIn(await phone.read('A Home')), '<p>hello from computer</p>', 'the phone has the computer\'s change');
  });

  await scenario('a note moved on the computer while text was pasted into it on the phone: both kept, no copy', async () => {
    // Reported 2026-11-17 in Arial Staging: the text went to a copy.
    const folder = 'Moved and written';
    await shared(phone, computer, folder);
    const start = await phone.read(folder);
    const withText = start.blocks.map(b => (b.id === 'n' ? { ...b, content: '<p>pasted on the phone</p>' } : b));
    await phone.write(folder, { ...start, blocks: withText });
    const there = await computer.read(folder);
    const moved = there.blocks.map(b => (b.id === 'n' ? { ...b, position: { x: 1030, y: 440 } } : b));
    await computer.write(folder, { ...there, blocks: moved });
    await computer.upload();
    await phone.upload(); // finds the cloud moved: merges
    await phone.upload(); // and sends the merge
    await computer.pull();
    expect(await copiesOf(phone, folder), [], 'copies on the phone');
    for (const dev of [phone, computer]) {
      const n = (await dev.read(folder)).blocks.find(b => b.id === 'n');
      expect(n.content, '<p>pasted on the phone</p>', `${dev.name}'s text`);
      expect([n.position?.x, n.position?.y], [1030, 440], `${dev.name}'s position`);
    }
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
