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

export function createRinger() {
  let beeper = null;
  primeOnFirstTouch();

  function beep() {
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
