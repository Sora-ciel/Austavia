/**
 * The sound an alarm or a finished timer makes: two short beeps a second, and
 * a buzz where the device has one.
 *
 * Made rather than played from a file, so there is nothing to ship or load and
 * nothing that can fail to arrive. Shared by the ringer in the main window and
 * the always-on-top pop-ups (utils/clockPopups.js), so both sound the same and
 * a change to the sound is made once.
 *
 * Browser-only: it needs Web Audio.
 */
export function createRinger() {
  let audio = null;
  let beeper = null;

  function beep() {
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
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
      this.set(false);
      audio?.close?.();
      audio = null;
    }
  };
}
