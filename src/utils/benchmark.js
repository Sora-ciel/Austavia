/**
 * The app timing itself on a heavy folder (asked 2026-11-17: the Linux app
 * lags more than the web one on heavy folders, and its memory climbs between
 * them -- "we'll have to do some tests").
 *
 * Runs only when asked: the desktop staging app started with
 * AUSTAVIA_BENCH_OUT=<file> (src-tauri/src/bench.rs), or any build opened with
 * ?bench=1. It makes a folder of notes with large photographs in their
 * writing -- what makes a folder heavy -- and measures, in each mode that
 * shows it: how long it takes to open, how smooth scrolling is, how long a
 * keystroke takes to show, and the memory before and after moving between
 * folders. The test folder is deleted at the end.
 *
 * `stats` is plain and tested; the rest needs a browser.
 */

/** Median, 95th percentile, worst and count of a list of milliseconds. */
export function stats(values) {
  const list = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.length) return { n: 0, median: 0, p95: 0, max: 0 };
  const at = q => list[Math.min(list.length - 1, Math.floor(q * (list.length - 1)))];
  const round = v => Math.round(v * 10) / 10;
  return { n: list.length, median: round(at(0.5)), p95: round(at(0.95)), max: round(list[list.length - 1]) };
}

const frame = () => new Promise(resolve => requestAnimationFrame(() => resolve(performance.now())));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** A photograph-like JPEG as a data URL: noise, which does not compress. */
function photo(width, height, seed) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  const image = g.createImageData(width, height);
  let x = seed * 9301 + 49297;
  for (let i = 0; i < image.data.length; i += 4) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    image.data[i] = x & 255;
    image.data[i + 1] = (x >> 8) & 255;
    image.data[i + 2] = (x >> 16) & 255;
    image.data[i + 3] = 255;
  }
  g.putImageData(image, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.8);
}

export const BENCH_FOLDER = 'Austavia benchmark (deleted after)';

function heavyFolder({ notes = 10, width = 1600, height = 1200 } = {}) {
  const words = 'The quick brown fox jumps over the lazy dog while the calendar keeps time. '.repeat(30);
  const blocks = [];
  for (let i = 0; i < notes; i += 1) {
    blocks.push({
      id: `bench-${i}`,
      type: 'text',
      position: { x: 40 + (i % 3) * 420, y: 40 + Math.floor(i / 3) * 520 },
      size: { width: 400, height: 500 },
      bgColor: '#1d1d1d',
      textColor: '#ffffff',
      content: `<h1>Note ${i}</h1><p>${words}</p><p><img src="${photo(width, height, i + 1)}"></p><p>${words}</p>`
    });
  }
  return {
    blocks,
    modeOrders: {},
    modeSettings: { page: { rows: blocks.map(block => ({ cells: [{ blockId: block.id }] })) } }
  };
}

/**
 * Run it. `app` gives what it needs from App.svelte: saveBlocks, deleteBlocks,
 * load(name), setMode(id), currentFolder(), memoryKb() (or null), tick().
 */
export async function runBenchmark(app, { modes = ['simple', 'page', 'default'], notes = 10 } = {}) {
  const report = { at: new Date().toISOString(), userAgent: navigator.userAgent, notes, modes: {} };
  const memory = async () => (app.memoryKb ? Math.round((await app.memoryKb()) / 1024) : null);
  const before = app.currentFolder();

  // The engine's own frame rate with nothing happening, as a floor for the rest.
  {
    const idle = [];
    let last = await frame();
    for (let i = 0; i < 60; i += 1) { const now = await frame(); idle.push(now - last); last = now; }
    report.idleFrameMs = stats(idle);
  }

  const t0 = performance.now();
  await app.saveBlocks(BENCH_FOLDER, heavyFolder({ notes }));
  report.writeMs = Math.round(performance.now() - t0);
  report.memoryMbStart = await memory();

  for (const mode of modes) {
    const result = {};
    // Opening: from the call until the pictures are decoded and drawn.
    const start = performance.now();
    app.setMode(mode);
    await app.load(BENCH_FOLDER);
    await app.tick();
    await Promise.all([...document.querySelectorAll('.modes img')].map(img => img.decode?.().catch(() => {})));
    await frame();
    await frame();
    result.openMs = Math.round(performance.now() - start);

    // The notes' pictures moved out of their writing (pictures by reference):
    // waited for, and timed, the first time the folder opens.
    if (report.convertMs === undefined) {
      const c0 = performance.now();
      for (let i = 0; i < 300; i += 1) {
        const inline = [...document.querySelectorAll('.modes .ProseMirror')].some(el => (el.editor?.getHTML?.() || '').includes('data:image/'));
        if (!inline) break;
        await wait(100);
      }
      report.convertMs = Math.round(performance.now() - c0);
    }

    // Scrolling: 2.5 seconds of steady scrolling, every frame's length.
    const scroller = [...document.querySelectorAll('.modes *')].find(el =>
      el.scrollHeight > el.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(el).overflowY));
    if (scroller) {
      const frames = [];
      let last = await frame();
      const until = last + 2500;
      while (last < until) {
        scroller.scrollTop = (scroller.scrollTop + 40) % Math.max(1, scroller.scrollHeight - scroller.clientHeight);
        const now = await frame();
        frames.push(now - last);
        last = now;
      }
      result.scrollFrameMs = stats(frames);
      scroller.scrollTop = 0;
    }

    // Typing: a character at the end of the first note, until it is drawn.
    const editorEl = document.querySelector('.modes .ProseMirror');
    const editor = editorEl?.editor;
    if (editor) {
      editor.commands.focus('end');
      const keys = [];
      const code = [];
      for (let i = 0; i < 40; i += 1) {
        const s = performance.now();
        editor.commands.insertContent('a');
        // What our code and the editor do before the engine gets to draw:
        // the keystroke itself, then everything queued by it.
        await Promise.resolve();
        await new Promise(resolve => setTimeout(resolve, 0));
        code.push(performance.now() - s);
        await frame();
        keys.push(performance.now() - s);
      }
      result.keystrokeMs = stats(keys);
      result.keystrokeCodeMs = stats(code);
      editor.commands.blur?.();
    }
    // Dragging a block by its header on the Canvas: a pointer move every
    // frame for two seconds, and how long each frame took (asked
    // 2026-11-17: moving a block lags on Linux).
    if (mode === 'default') {
      const header = document.querySelector('.modes [data-block-id] .header');
      if (header) {
        const box = header.getBoundingClientRect();
        let x = box.left + 30;
        let y = box.top + box.height / 2;
        const opts = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, isPrimary: true };
        header.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: x, clientY: y }));
        header.dispatchEvent(new MouseEvent('mousedown', { ...opts, clientX: x, clientY: y }));
        const frames = [];
        const moves = [];
        let last = await frame();
        for (let i = 0; i < 120; i += 1) {
          x += 3; y += 2;
          const m0 = performance.now();
          window.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: x, clientY: y }));
          window.dispatchEvent(new MouseEvent('mousemove', { ...opts, clientX: x, clientY: y }));
          moves.push(performance.now() - m0);
          const now = await frame();
          frames.push(now - last);
          last = now;
        }
        window.dispatchEvent(new PointerEvent('pointerup', { ...opts, clientX: x, clientY: y, buttons: 0 }));
        window.dispatchEvent(new MouseEvent('mouseup', { ...opts, clientX: x, clientY: y, buttons: 0 }));
        result.dragFrameMs = stats(frames);
        result.dragMoveCodeMs = stats(moves);
      }
    }

    result.memoryMbOpen = await memory();
    report.modes[mode] = result;
    await wait(300);
  }

  // Simple Note again under a few style changes, to find what a keystroke's
  // drawing time is spent on (2026-11-17).
  if (modes.includes('simple')) {
    // Kept as a place to try style changes; the one that mattered, the
    // card's glow on a layer of its own, is in SimpleNoteMode now.
    const variants = {
      noShadows: '.modes *, .modes *::before, .modes *::after { box-shadow: none !important; text-shadow: none !important; }'
    };
    report.simpleVariants = {};
    for (const [name, css] of Object.entries(variants)) {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
      app.setMode('simple');
      await app.tick();
      await frame();
      await frame();
      const editor = document.querySelector('.modes .ProseMirror')?.editor;
      if (editor) {
        editor.commands.focus('end');
        const keys = [];
        for (let i = 0; i < 30; i += 1) {
          const s0 = performance.now();
          editor.commands.insertContent('a');
          await frame();
          keys.push(performance.now() - s0);
        }
        report.simpleVariants[name] = stats(keys).median;
      }
      style.remove();
      await frame();
    }
  }

  // Memory across moving between folders: back and forth three times.
  if (before) {
    for (let i = 0; i < 3; i += 1) {
      await app.load(before);
      await wait(500);
      await app.load(BENCH_FOLDER);
      await wait(500);
    }
    report.memoryMbAfterSwitching = await memory();
    await app.load(before);
  }
  await app.deleteBlocks(BENCH_FOLDER);
  await wait(1500);
  report.memoryMbEnd = await memory();
  return report;
}

/**
 * Where a keystroke's time goes, in Single Note, on notes of growing size
 * (asked 2026-11-25: the phone still lags writing; "if a single text block
 * in Single Note was 100mb, how would we do so that it doesn't lag"). Each
 * suspect is timed on its own, on the same note, so the one that grows with
 * the note shows itself. Opened with ?bench=typing.
 *
 * - keyToFrameMs: a letter typed until the next frame, what is felt;
 * - freezes: long tasks while typing at a person's pace;
 * - layoutMs: the browser laying the note out again after one letter;
 * - getHtmlMs: the note turned into HTML, as every change is;
 * - stringifyMs: the folder packed for saving, as a save does;
 * - saveMs: the folder written to the device.
 */
// The first line of every test note, so the breakdown types only into an
// editor that shows it -- never into a note of anybody's that happens to be
// on screen while the test folder is still opening (which a first version
// did on a phone, 2026-11-25; the letters were lost in the folder switch,
// found by searching the device, but only by luck).
const MARKER = 'Austavia typing benchmark';
function textNote(chars) {
  const sentence = 'The quick brown fox jumps over the lazy dog while the calendar keeps time. ';
  const paragraph = `<p>${sentence.repeat(8)}</p>`;
  return `<p>${MARKER} ${chars}</p>` + paragraph.repeat(Math.max(1, Math.round(chars / (sentence.length * 8))));
}

/** The editor showing this test note, waited for; null if it never opens. */
async function testEditor(chars, timeoutMs = 30000) {
  const until = performance.now() + timeoutMs;
  while (performance.now() < until) {
    const el = [...document.querySelectorAll('.modes .ProseMirror')].find(e => (e.textContent || '').startsWith(`${MARKER} ${chars}`));
    if (el?.editor) return el;
    await wait(250);
  }
  return null;
}

export async function runTypingBreakdown(app, { sizes = [16000, 64000, 256000] } = {}) {
  const report = { at: new Date().toISOString(), userAgent: navigator.userAgent, sizes: {} };
  const before = app.currentFolder();
  const freezes = [];
  let observer = null;
  try {
    observer = new PerformanceObserver(list => { for (const e of list.getEntries()) freezes.push(e.duration); });
    observer.observe({ type: 'longtask', buffered: false });
  } catch { observer = null; }

  const folders = [];
  for (const chars of sizes) {
    // A folder per size: reopening the same name keeps the note it had.
    const name = `${BENCH_FOLDER} ${chars}`;
    folders.push(name);
    const payload = {
      blocks: [{ id: 'bench-note', type: 'text', position: { x: 40, y: 40 }, size: { width: 600, height: 600 }, bgColor: '#1d1d1d', textColor: '#ffffff', content: textNote(chars) }],
      modeOrders: {},
      modeSettings: {}
    };
    await app.saveBlocks(name, payload);
    app.setMode('single');
    await app.load(name);
    await app.tick();
    const editorEl = await testEditor(chars);
    const editor = editorEl?.editor;
    // Not the test note on screen: nothing is typed, anywhere.
    if (!editor) { report.sizes[chars] = { error: 'the test note never opened; nothing was typed' }; break; }
    await wait(1000);
    editor.commands.focus('end');
    await wait(300);

    const result = { chars: editor.state.doc.textContent.length };
    // Typing at a person's pace: a letter every 120ms.
    freezes.length = 0;
    const keys = [];
    for (let i = 0; i < 40; i += 1) {
      const s0 = performance.now();
      editor.commands.insertContent('a');
      await frame();
      keys.push(performance.now() - s0);
      await wait(120);
    }
    await wait(1200);
    result.keyToFrameMs = stats(keys);
    result.freezes = { count: freezes.length, totalMs: Math.round(freezes.reduce((a, b) => a + b, 0)), worstMs: Math.round(Math.max(0, ...freezes)) };

    // Each suspect on its own.
    const layout = [];
    for (let i = 0; i < 10; i += 1) {
      editor.commands.insertContent('b');
      const l0 = performance.now();
      void editorEl.getBoundingClientRect().height; void document.body.offsetHeight;
      layout.push(performance.now() - l0);
      await frame();
    }
    result.layoutMs = stats(layout);
    const html = [];
    let last = '';
    for (let i = 0; i < 5; i += 1) { const t = performance.now(); last = editor.getHTML(); html.push(performance.now() - t); }
    result.getHtmlMs = stats(html);
    const folder = { ...payload, blocks: [{ ...payload.blocks[0], content: last }] };
    const str = [];
    for (let i = 0; i < 5; i += 1) { const t = performance.now(); JSON.stringify(folder); str.push(performance.now() - t); }
    result.stringifyMs = stats(str);
    const save = [];
    for (let i = 0; i < 3; i += 1) { const t = performance.now(); await app.saveBlocks(name, folder); save.push(performance.now() - t); }
    result.saveMs = stats(save);
    editor.commands.blur?.();
    report.sizes[chars] = result;
    await wait(500);
  }
  observer?.disconnect();
  if (before) await app.load(before);
  for (const name of folders) await app.deleteBlocks(name);
  return report;
}

/**
 * A test note opened and held, for typing into from outside the page the way
 * a keyboard does (?bench=hold) -- the phone's keyboard goes through the
 * browser's text input, which the editor handles differently from the app
 * inserting a letter. Measures from each `beforeinput` to the next frame.
 * Released, and the note deleted, when window.__benchRelease is set.
 */
export async function holdTypingNote(app, { chars = 20000, pictures = 0 } = {}) {
  const before = app.currentFolder();
  const name = `${BENCH_FOLDER} hold`;
  // Photographs in the writing, kept by reference as the app keeps them
  // (asked 2026-11-25: "10 or 100 images are about 50mo"), spread through
  // the note; deleted from the device at the end.
  const { storePicture } = await import('./pictureStore.js');
  const { deletePictureBlob } = await import('../storage.js');
  const { hashOfRef } = await import('./pictureRefs.js');
  const refs = [];
  for (let i = 0; i < pictures; i += 1) refs.push(await storePicture(photo(800, 600, i + 1)));
  let content = textNote(chars);
  if (refs.length) {
    const parts = content.split('</p>');
    const every = Math.max(1, Math.floor(parts.length / (refs.length + 1)));
    content = parts.map((part, i) => (part && i > 0 && i % every === 0 && refs.length ? `${part}</p><p><img src="${refs.shift()}">` : part)).join('</p>');
    content += refs.map(ref => `<p><img src="${ref}"></p>`).join('');
  }
  const kept = [...content.matchAll(/austavia-picture:[A-Za-z0-9_-]+/g)].map(m => m[0]);
  const t0 = performance.now();
  await app.saveBlocks(name, {
    blocks: [{ id: 'bench-note', type: 'text', position: { x: 40, y: 40 }, size: { width: 600, height: 600 }, bgColor: '#1d1d1d', textColor: '#ffffff', content }],
    modeOrders: {},
    modeSettings: {}
  });
  app.setMode('single');
  await app.load(name);
  await app.tick();
  const editorEl = await testEditor(chars);
  const result = { chars, pictures, ready: Boolean(editorEl), openMs: Math.round(performance.now() - t0), inputToFrameMs: null };
  if (editorEl) {
    const times = [];
    const onInput = () => {
      const t0 = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => times.push(performance.now() - t0)));
    };
    editorEl.addEventListener('beforeinput', onInput);
    editorEl.editor.commands.focus('end');
    window.__benchHold = { ready: true, times };
    while (!window.__benchRelease) await wait(200);
    editorEl.removeEventListener('beforeinput', onInput);
    result.inputToFrameMs = stats(times);
  }
  if (before) await app.load(before);
  await app.deleteBlocks(name);
  for (const ref of new Set(kept)) await deletePictureBlob(hashOfRef(ref)).catch(() => {});
  return result;
}
