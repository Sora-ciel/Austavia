/**
 * The sound an alarm or a finished timer makes: two short beeps a second, and
 * a buzz where the device has one.
 *
 * Made rather than played from a file, so there is nothing to ship or load and
 * nothing that can fail to arrive. Played by the main window only
 * (AlarmRinger.svelte): the always-on-top pop-ups used to ring for themselves,
 * and nothing had ever been clicked in them, so the Linux app's web engine
 * kept them silent. The main window has been clicked in -- the timer was
 * started there.
 *
 * Browser-only: it needs Web Audio.
 */
/**
 * How long a finished timer or objective keeps sounding when nobody stops
 * it: "a sound that continues till it's put close or 2min passed"
 * (2026-11-10). What it shows -- the banner, the pop-up -- stays for its own
 * ring window; only the sound stops.
 */
export const RING_SOUND_MS = 2 * 60 * 1000;

/** Whether something that finished at `endedAt` is still making a sound at `now`. */
export function stillSounding(endedAt, now = Date.now()) {
  const end = Number(endedAt);
  if (!Number.isFinite(end) || end <= 0) return false;
  return now >= end && now - end < RING_SOUND_MS;
}

// One sound for the whole window, opened on the first click or key press in
// it. A web engine plays nothing a page made by itself before anybody touched
// it -- the Linux app's (WebKitGTK) stays silent for good -- and a timer ends
// when nobody is touching anything. Opened and woken while somebody is, it is
// allowed to sound later. Reported 2026-11-10: no sound at "Time's up" on
// Linux.
let audio = null;
function openAudio() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch {
    // No audio here.
  }
  return audio;
}

let primed = false;
function primeOnFirstTouch() {
  if (primed || typeof window === 'undefined') return;
  primed = true;
  const wake = () => {
    openAudio();
    if (audio?.state === 'running') {
      window.removeEventListener('pointerdown', wake, true);
      window.removeEventListener('keydown', wake, true);
    }
  };
  window.addEventListener('pointerdown', wake, true);
  window.addEventListener('keydown', wake, true);
}

/**
 * The two beeps as a WAV file: 880Hz, each 0.18s, the second 0.22s after the
 * first, rising in 20ms and dying away -- what the Web Audio version below
 * plays, written out as samples so an ordinary <audio> can play it.
 *
 * Why a file at all: on the Linux app Web Audio made no sound at "Time's up"
 * even with the app clicked in, while music played through an <audio> was
 * heard (2026-11-10). So the ring goes the way the music goes, and Web Audio
 * is what is tried when that is refused.
 */
export function beepWav(sampleRate = 22050) {
  const length = Math.round(sampleRate * 0.42);
  const data = new Int16Array(length);
  for (const offset of [0, 0.22]) {
    const from = Math.round(offset * sampleRate);
    const count = Math.round(0.18 * sampleRate);
    for (let i = 0; i < count && from + i < length; i += 1) {
      const t = i / sampleRate;
      const rise = Math.min(1, t / 0.02);
      const fall = t < 0.02 ? 1 : Math.exp(-(t - 0.02) / 0.025);
      data[from + i] = Math.round(Math.sin(2 * Math.PI * 880 * t) * rise * fall * 0.3 * 32767);
    }
  }
  const bytes = new Uint8Array(44 + data.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (at, word) => { for (let i = 0; i < word.length; i += 1) bytes[at + i] = word.charCodeAt(i); };
  text(0, 'RIFF'); view.setUint32(4, 36 + data.length * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i += 1) view.setInt16(44 + i * 2, data[i], true);
  return bytes;
}

// As a data: address, made once. Not a blob: the Linux app's web engine
// cannot rewind a blob (utils/audioAddress.js), and each beep is a fresh
// <audio> from the start, so nothing is ever rewound anyway.
let beepAddress = null;
function beepUrl() {
  if (beepAddress) return beepAddress;
  const bytes = beepWav();
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  beepAddress = `data:audio/wav;base64,${btoa(binary)}`;
  return beepAddress;
}

// Which way the sound went, written to the sync log once (Copy diagnostics),
// since nobody can see from outside why a ring is silent.
let reported = '';
function report(how) {
  if (how === reported) return;
  reported = how;
  import('./syncLog.js').then(({ logSync }) => logSync('ring', '', how)).catch(() => {});
}

export function createRinger() {
  let beeper = null;
  primeOnFirstTouch();

  function beep() {
    let element = null;
    try {
      element = new Audio(beepUrl());
    } catch {
      element = null;
    }
    if (!element) {
      synthBeep();
    } else {
      element.play().then(
        () => report('rang through an audio element'),
        error => {
          report(`the audio element was refused (${error?.name || error}); rang through Web Audio`);
          synthBeep();
        }
      );
    }
    try {
      navigator.vibrate?.([180, 60, 180]);
    } catch {
      // Not a device that vibrates.
    }
  }

  function synthBeep() {
    try {
      const audio = openAudio();
      if (!audio) throw new Error('no audio');
      const start = audio.currentTime;
      for (const offset of [0, 0.22]) {
        const tone = audio.createOscillator();
        const gain = audio.createGain();
        tone.type = 'sine';
        tone.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, start + offset);
        gain.gain.exponentialRampToValueAtTime(0.3, start + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.16);
        tone.connect(gain).connect(audio.destination);
        tone.start(start + offset);
        tone.stop(start + offset + 0.18);
      }
    } catch {
      // No audio here; whatever is showing the ring still shows it.
    }
  }

  return {
    /**
     * One ring and no more: a count objective finished by a tap (see
     * utils/taskGoalRings.js), where somebody is already looking.
     */
    chime() {
      beep();
    },
    /** Start or stop ringing. Safe to call with the same value repeatedly. */
    set(on) {
      if (on && !beeper) {
        beep();
        beeper = setInterval(beep, 1000);
      } else if (!on && beeper) {
        clearInterval(beeper);
        beeper = null;
        try { navigator.vibrate?.(0); } catch { /* nothing to stop */ }
      }
    },
    destroy() {
      // The window's one sound stays open for the next ringer.
      this.set(false);
    }
  };
}
