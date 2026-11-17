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
