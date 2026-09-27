/**
 * This device's memory of each clock block -- which page is open, when its
 * alarm was last answered, and until when it is snoozed.
 *
 * Kept in local storage and never in the folder: see utils/alarm.js for why.
 * What the values mean is decided there; this only keeps them, and lets the
 * block and the ringer see the same thing. Answer an alarm from the banner and
 * the block shows it answered; answer it from the block and the banner goes.
 */
import { writable, get } from 'svelte/store';
import { readClockDevice, clockDeviceKey } from './alarm.js';

export const clockDevices = writable({});

function readStored(blockId) {
  try {
    return readClockDevice(localStorage.getItem(clockDeviceKey(blockId)));
  } catch {
    // Private window, blocked storage: the block still works, it just starts
    // on the clock every time.
    return readClockDevice(null);
  }
}

/** This device's memory of one block, read from storage the first time. */
export function clockDevice(blockId) {
  const known = get(clockDevices)[blockId];
  if (known) return known;

  const stored = readStored(blockId);
  clockDevices.update(all => ({ ...all, [blockId]: stored }));
  return stored;
}

/**
 * This device's memory of one block, out of `all` -- the store's current value
 * -- or from storage when the store has not met it yet.
 *
 * Reads without writing, so it is safe inside a reactive statement: updating a
 * store from a statement that reads it makes the statement run again.
 */
export function peekClockDevice(blockId, all) {
  return all?.[blockId] || readStored(blockId);
}

/** Replace this device's memory of one block. */
export function setClockDevice(blockId, next) {
  const value = readClockDevice(next);
  clockDevices.update(all => ({ ...all, [blockId]: value }));
  try {
    localStorage.setItem(clockDeviceKey(blockId), JSON.stringify(value));
  } catch {
    // Kept for this session only.
  }
}

// Another tab of the app on this device -- answering in one silences the other.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    const prefix = clockDeviceKey('');
    if (!event.key || !event.key.startsWith(prefix)) return;
    const blockId = event.key.slice(prefix.length);
    clockDevices.update(all => ({ ...all, [blockId]: readClockDevice(event.newValue) }));
  });
}
