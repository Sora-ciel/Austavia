// Keeps music playing on Android once the screen goes off, and puts what's
// playing in the notification shade.
//
// Two separate things are at work here, and they're easy to conflate. A
// foreground service is what stops Android suspending the WebView, so playback
// survives the screen going off. A media session is what makes the
// notification a *media* notification — the wide one with artwork and
// transport controls that other music players post — instead of a plain line
// of text.
//
// This talks to a small native plugin that owns both. An earlier version used
// a generic foreground-service plugin: playback kept running, but it could
// only post an ordinary notification, and none appeared at all when the
// notification permission hadn't been granted.
//
// Only Android needs any of it. On the web and in the desktop shell the
// browser keeps playing on its own, so everything here is a no-op there.

import { positionReport, seekTarget } from './playbackPosition.js';

let plugin = null;
let pluginLoadFailed = false;
let listenerAttached = false;
let shown = false;
let actionHandlers = {};
/** The last thing handed to the notification, for the diagnostics report. */
let lastSent = null;

function isNativeAndroid() {
  const capacitor = typeof window !== 'undefined' ? window.Capacitor : null;
  if (!capacitor?.isNativePlatform?.()) return false;
  return capacitor.getPlatform?.() === 'android';
}

function getPlugin() {
  if (plugin || pluginLoadFailed) return plugin;
  const registry = window.Capacitor?.Plugins;
  if (registry?.MediaNotification) plugin = registry.MediaNotification;
  else pluginLoadFailed = true;
  return plugin;
}

/** Registers what the notification's controls should do. */
export function setBackgroundAudioActions(handlers) {
  actionHandlers = handlers || {};
}

function attachActionListener(service) {
  if (listenerAttached) return;
  listenerAttached = true;
  try {
    service.addListener('action', event => {
      const action = event?.action;
      if (action === 'previous') actionHandlers.previous?.();
      else if (action === 'toggle') actionHandlers.toggle?.();
      else if (action === 'next') actionHandlers.next?.();
      // Swiped away, or stopped from a car or headset. Not the same as the app
      // asking for the notification to go, which never comes back through here.
      else if (action === 'dismiss') actionHandlers.dismiss?.();
      // The only one that carries anything: where on the bar it was dragged to.
      else if (action === 'seek') actionHandlers.seek?.(seekTarget(event?.position));
    });
  } catch (error) {
    console.warn('Could not listen for notification controls:', error);
    listenerAttached = false;
  }
}

/**
 * Shows or refreshes the notification. Safe to call repeatedly — the same
 * notification is updated in place, which is how the track name and the
 * play/pause button stay current.
 *
 * `artwork` is a data URL: the notification can't read a blob: URL, since
 * those only mean anything inside the page that made them.
 */
export async function startBackgroundAudio({
  title,
  artist,
  artwork,
  isPlaying = false,
  position,
  duration
} = {}) {
  if (!isNativeAndroid()) return;
  const service = getPlugin();
  if (!service) return;

  attachActionListener(service);

  // Where the track is up to, so Android's own player can draw a progress bar
  // and let it be dragged. Left out entirely when it is not known yet rather
  // than sent as zero — see utils/playbackPosition.js.
  const where = positionReport({ position, duration, playing: isPlaying });

  try {
    lastSent = {
      at: Date.now(),
      titleChars: (title || '').length,
      artworkChars: (artwork || '').length,
      playing: Boolean(isPlaying),
      positionMs: where?.positionMs ?? null,
      durationMs: where?.durationMs ?? null,
      error: null
    };

    await service.show({
      title: title || 'Playing',
      artist: artist || '',
      artwork: artwork || '',
      playing: isPlaying,
      ...(where ? { position: where.positionMs } : {}),
      ...(where?.durationMs ? { duration: where.durationMs } : {})
    });
    shown = true;
  } catch (error) {
    if (lastSent) lastSent.error = String(error?.message || error);
    console.warn('Could not show the playback notification:', error);
  }
}

/**
 * Both halves of the handover, for the diagnostics report.
 *
 * What the web layer sent, and what the service says it received. The point is
 * the comparison: artwork counted here but not there never crossed, artwork
 * counted on both sides but no bitmap would not decode, and a bitmap with a size
 * means the picture is in Android's hands and the rest is the system's doing.
 * Each is a different fault, and from the outside they look identical.
 */
export async function notificationDiagnostics() {
  if (!isNativeAndroid()) return { platform: 'not android', sent: lastSent };
  const service = getPlugin();
  if (!service) return { platform: 'android', plugin: 'missing', sent: lastSent };

  try {
    const native = typeof service.status === 'function' ? await service.status() : null;
    return { platform: 'android', sent: lastSent, native };
  } catch (error) {
    // An older build of the app with a newer web layer, most likely.
    return { platform: 'android', sent: lastSent, native: null, error: String(error?.message || error) };
  }
}

/** Takes the notification down. Called when playback stops altogether. */
export async function stopBackgroundAudio() {
  if (!isNativeAndroid() || !shown) return;
  const service = getPlugin();
  if (!service) return;
  try {
    await service.hide();
  } catch (error) {
    console.warn('Could not hide the playback notification:', error);
  } finally {
    // Cleared either way, so a later start isn't blocked.
    shown = false;
  }
}
