/**
 * The address the music player is given for a track.
 *
 * ## What was asked for
 *
 * "There's also bugs when you move the timeline: a music that worked well
 * stops working at all, the timeline moves again but no sound. Sometimes a
 * music fails at playing even though it works when putting it back." Reported
 * 2026-10-09 on the Linux app, the same day m4a tracks were made to start with
 * sound (utils/mp4Faststart.js).
 *
 * ## What was measured
 *
 * In a WebKitGTK webview, playing tracks from the user's own library and
 * moving the timeline 60s → 20s → 120s → 40s → 90s:
 *
 * - **m4a from a blob:** the jump forward worked; the first jump back failed
 *   with "Internal data stream error" (MediaError 4), and from then on the
 *   clock moved with no sound. The same with a file ffmpeg had put in order, so
 *   it is not the layout.
 * - **mp3 from a blob:** every jump worked.
 * - **The same m4a from http://127.0.0.1**, even from a page on a custom
 *   scheme as Austavia's is: every jump worked.
 * - **From a custom scheme:** did not play at all.
 *
 * WebKitGTK feeds a blob to GStreamer as a stream it cannot rewind, and an MP4
 * needs rewinding to seek back. From http it can ask for any part of the file.
 *
 * ## What this does
 *
 * On the Linux desktop app the track's bytes go to a small server inside the
 * app (src-tauri/src/audio_server.rs) that only this computer can reach, and the
 * player is given its http address. Everywhere else — Windows, Android, a
 * browser tab — a blob is fine and is what is used, as before.
 *
 * If the server cannot be reached the blob is used anyway: a track whose
 * timeline cannot go backwards is better than one that does not play.
 */

/** `server` on the Linux desktop app, `blob` everywhere else. */
export function audioAddressMethod({ isTauri = false, userAgent = '' } = {}) {
  if (isTauri && /Linux/i.test(userAgent) && !/Android/i.test(userAgent)) return 'server';
  return 'blob';
}

function currentMethod() {
  return audioAddressMethod({
    isTauri: typeof window !== 'undefined' && !!(window.__TAURI_INTERNALS__ || window.__TAURI__),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : ''
  });
}

async function invokeTauri(command, body, options) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(command, body, options);
}

/**
 * An address the player can play `blob` from. `method` and `invoke` are only
 * passed by tests.
 */
export async function addressForAudio(blob, { method = currentMethod(), invoke = invokeTauri } = {}) {
  if (method === 'server') {
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return await invoke('serve_audio', bytes, { headers: { 'x-audio-type': blob.type || '' } });
    } catch (error) {
      console.error('Could not hand the track to the audio server; playing it from memory.', error);
    }
  }
  return URL.createObjectURL(blob);
}

/**
 * Lets an address go once nothing plays from it. A blob is revoked; the server
 * drops old tracks by itself.
 */
export function releaseAudioAddress(address) {
  if (typeof address === 'string' && address.startsWith('blob:')) URL.revokeObjectURL(address);
}
