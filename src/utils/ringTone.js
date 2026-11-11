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
 * How loud the ring is, out of 1. It was 0.3, and not loud enough: "the
 * alarm isn't loud enough make it louder please" (2026-11-10). 0.9 was
 * offered, then 65% asked for, then "make the ring volume be 80%".
 */
export const RING_LOUDNESS = 0.8;

/** The two beeps: 880Hz, each 0.18s, the second 0.22s after the first, once a second. */
const BEEP_HZ = 880;
const BEEP_AT = [0, 0.22];
const BEEP_LENGTH = 0.18;

/**
 * The ring as a WAV file of `seconds` seconds: two beeps a second, rising in
 * 20ms and dying away -- what the Web Audio version below plays, written out
 * as samples so an ordinary <audio> can play it.
 *
 * Why a file: on the Linux app Web Audio made no sound at "Time's up" even
 * with the app clicked in, while music played through an <audio> was heard
 * (2026-11-10).
 *
 * Why the whole ring in one file rather than one second repeated: a window
 * behind others has its timers slowed, and the beeps spread out after a few
 * seconds -- first with a timer starting each beep, then still with the
 * <audio> looping (2026-11-10). A file that already holds two minutes of
 * beeps has nothing to repeat. At 8000 samples a second -- plenty for an
 * 880Hz tone -- two minutes is under 2MB.
 */
export function beepWav(sampleRate = 8000, seconds = 1) {
  const length = Math.round(sampleRate * seconds);
  const data = new Int16Array(length);
  const count = Math.round(BEEP_LENGTH * sampleRate);
  // One second of it, worked out once and copied.
  const pattern = new Int16Array(Math.min(length, sampleRate));
  for (const offset of BEEP_AT) {
    const from = Math.round(offset * sampleRate);
    for (let i = 0; i < count && from + i < pattern.length; i += 1) {
      const t = i / sampleRate;
      const rise = Math.min(1, t / 0.02);
      const fall = t < 0.02 ? 1 : Math.exp(-(t - 0.02) / 0.025);
      pattern[from + i] = Math.round(Math.sin(2 * Math.PI * BEEP_HZ * t) * rise * fall * RING_LOUDNESS * 32767);
    }
  }
  for (let at = 0; at < length; at += sampleRate) data.set(pattern.subarray(0, Math.min(pattern.length, length - at)), at);

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

// As a data: address. Not a blob: the Linux app's web engine cannot rewind a
// blob (utils/audioAddress.js); nothing here is rewound.
//
// Made in memory when it is needed -- nothing is shipped with the app, so its
// size is unchanged. The one-second chime is kept; the two-minute ring
// (about 2.5MB as text) is made afresh for each ring and let go when it
// stops, rather than held for the rest of the session.
let chimeAddress = null;
function wavUrl(seconds) {
  if (seconds === 1 && chimeAddress) return chimeAddress;
  const bytes = beepWav(8000, seconds);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const address = `data:audio/wav;base64,${btoa(binary)}`;
  if (seconds === 1) chimeAddress = address;
  return address;
}
const RING_SECONDS = RING_SOUND_MS / 1000;

// Which way the sound went, written to the sync log once (Copy diagnostics),
// since nobody can see from outside why a ring is silent.
let reported = '';
function report(how) {
  if (how === reported) return;
  reported = how;
  import('./syncLog.js').then(({ logSync }) => logSync('ring', '', how)).catch(() => {});
}

/**
 * The ring through Web Audio, for when the <audio> is refused: every beep of
 * the two minutes lined up at once on the sound card's own clock, which a
 * window behind others does not slow, all through one volume that is cut to
 * stop it. Returns that stop, or null with no Web Audio here.
 */
function synthRing(seconds) {
  try {
    const audio = openAudio();
    if (!audio) return null;
    const master = audio.createGain();
    master.connect(audio.destination);
    const start = audio.currentTime + 0.02;
    for (let second = 0; second < seconds; second += 1) {
      for (const offset of BEEP_AT) {
        const at = start + second + offset;
        const tone = audio.createOscillator();
        const gain = audio.createGain();
        tone.type = 'sine';
        tone.frequency.value = BEEP_HZ;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(RING_LOUDNESS, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + BEEP_LENGTH - 0.02);
        tone.connect(gain).connect(master);
        tone.start(at);
        tone.stop(at + BEEP_LENGTH);
      }
    }
    return () => {
      try { master.gain.setValueAtTime(0, audio.currentTime); master.disconnect(); } catch { /* already stopped */ }
    };
  } catch {
    return null;
  }
}

/** One sound of `seconds`: a fresh <audio>, or Web Audio when that is refused. Returns its stop. */
function playRing(seconds) {
  let stopped = false;
  let stopSynth = null;
  let element = null;
  try { element = new Audio(wavUrl(seconds)); } catch { element = null; }
  if (!element) {
    stopSynth = synthRing(seconds);
  } else {
    element.play().then(
      () => {
        report('rang through an audio element');
        if (stopped) element.pause();
      },
      error => {
        report(`the audio element was refused (${error?.name || error}); rang through Web Audio`);
        if (!stopped) stopSynth = synthRing(seconds);
      }
    );
  }
  return () => {
    stopped = true;
    try {
      element?.pause();
      // Lets the two minutes of sound go.
      element?.removeAttribute('src');
      element?.load();
    } catch { /* already stopped */ }
    element = null;
    stopSynth?.();
  };
}

export function createRinger() {
  let stopSound = null;
  let buzzTimer = null;

  primeOnFirstTouch();

  function vibrate() {
    try {
      navigator.vibrate?.([180, 60, 180]);
    } catch {
      // Not a device that vibrates.
    }
  }

  return {
    /**
     * One ring and no more: a count objective finished by a tap (see
     * utils/taskGoalRings.js), where somebody is already looking.
     */
    chime() {
      playRing(1);
      vibrate();
    },
    /**
     * Start or stop ringing. Safe to call with the same value repeatedly.
     * The sound is the whole two minutes from the start (RING_SOUND_MS); the
     * ringer is told to stop when it is stopped, or when the two minutes are
     * up, whichever is first.
     */
    set(on) {
      if (on && !stopSound) {
        stopSound = playRing(RING_SECONDS);
        vibrate();
        if (typeof navigator !== 'undefined' && navigator.vibrate) buzzTimer = setInterval(vibrate, 1000);
      } else if (!on && stopSound) {
        stopSound();
        stopSound = null;
        clearInterval(buzzTimer);
        buzzTimer = null;
        try { navigator.vibrate?.(0); } catch { /* nothing to stop */ }
      }
    },
    destroy() {
      // The window's one sound stays open for the next ringer.
      this.set(false);
    }
  };
}
