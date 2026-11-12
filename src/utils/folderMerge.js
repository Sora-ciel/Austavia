/**
 * Two devices that changed the same folder: merge what they changed, block by
 * block, and keep a copy only where both changed the same thing.
 *
 * ## What was asked for
 *
 * 2026-11-12, after a rename and back on the PC and two tasks added on the
 * phone made "Arial (from computer, 12 Nov)" -- a whole copy of a folder for
 * a change that was not one: "what we need instead is for the app to actually
 * see if each block or type of content has been changed. and it merges the
 * change if the change was made at different blocks or content. and it does
 * the name thing only when the change was at the same content."
 *
 * ## How
 *
 * A merge needs to know what each side started from. So every time a device
 * and the cloud agree on a folder -- it uploaded it, or downloaded it -- the
 * device writes down a fingerprint of each part as it was then (`baseOf`):
 * each block by its id, each part of the mode settings, the order of blocks.
 * Fingerprints, not copies: a few dozen bytes per block, not a second copy of
 * every picture.
 *
 * When both sides moved, each part is compared with what it was:
 *   - changed on one side only: that side's version;
 *   - changed on both, the same way: either;
 *   - changed on both, differently: a conflict. The folder takes the other
 *     device's version of that part, and this device's whole version is kept
 *     as "Name (from computer, 12 Nov)" -- "the name thing" -- so nothing is
 *     lost;
 *   - added on either side: kept; deleted on one side and untouched on the
 *     other: deleted; deleted on one, changed on the other: kept, a conflict.
 *
 * What a fingerprint leaves out is what is not somebody's work: the folder's
 * stamps, its hidden id (given on the first rename), and whether a picture is
 * a cloud link or stored inside the folder (a rename changes that). So a
 * rename, a rename back or a re-save is no change at all. The cost: replacing
 * one picture with another in the same block, and nothing else, reads as no
 * change -- if the other device changed that block, its version is kept.
 *
 * No fingerprint written down yet (a folder not synced since updating) means
 * nothing to merge from: the caller falls back to keeping both, as before.
 */

/** A folder's stamps: taken off a merge, so saving it stamps it as a change made here. */
const PAYLOAD_STAMPS = ['modifiedAt', 'updatedAt', 'lastSyncedAt'];

const PICTURE = /data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+|https:\/\/firebasestorage\.googleapis\.com\/[^\s"'<>)]+/gi;

function stable(value) {
  if (typeof value === 'string') return JSON.stringify(value.replace(PICTURE, 'picture'));
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const keys = Object.keys(value).filter(key => value[key] !== undefined).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}

// Two FNV-1a passes with different seeds: a fingerprint, not a secret, but
// two different blocks reading as the same would lose a change.
function hash(text) {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995);
  }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36) + text.length.toString(36);
}

/** The fingerprint of one part of a folder. */
export function fingerprint(value) {
  return hash(stable(value));
}

function settingFingerprint(key, value) {
  // The folder's id is given by a rename; it is not a change to anything.
  if (key === 'folder' && value && typeof value === 'object') {
    const { id, ...rest } = value;
    return fingerprint(rest);
  }
  return fingerprint(value);
}

function blocksById(payload) {
  const map = new Map();
  for (const block of Array.isArray(payload?.blocks) ? payload.blocks : []) {
    if (!block || typeof block !== 'object' || !block.id || map.has(block.id)) return null;
    map.set(block.id, block);
  }
  return map;
}

/** What a folder was when a device and the cloud last agreed on it. */
export function baseOf(payload) {
  const blocks = blocksById(payload);
  if (!blocks) return null;
  const settings = {};
  for (const [key, value] of Object.entries(payload?.modeSettings || {})) {
    settings[key] = settingFingerprint(key, value);
  }
  const parts = {};
  for (const [id, block] of blocks) parts[id] = fingerprint(block);
  return { blocks: parts, settings, orders: fingerprint(payload?.modeOrders || {}) };
}

/**
 * One part, three versions. `base` is a fingerprint or undefined (it did not
 * exist then); `local`/`remote` are the values or undefined (absent there).
 * Returns { take: 'local' | 'remote', conflict }.
 */
function decide(base, local, remote, print) {
  const l = local === undefined ? undefined : print(local);
  const r = remote === undefined ? undefined : print(remote);
  if (l === r) return { take: 'remote', conflict: false };
  if (l === base) return { take: 'remote', conflict: false }; // only the other side changed it
  if (r === base) return { take: 'local', conflict: false }; // only this side changed it
  // Both changed it, differently. Whatever exists wins over a deletion, so
  // nothing written is lost from the folder; either way it is a conflict.
  if (remote === undefined) return { take: 'local', conflict: true };
  return { take: 'remote', conflict: true };
}

/**
 * The folder with both devices' changes in it.
 *
 * Returns null when it cannot be merged (no base, or blocks without ids):
 * then the caller keeps both versions whole, as before. Otherwise
 * { payload, conflicts, fromLocal }: `conflicts` names the parts both changed
 * (the caller keeps this device's version as a copy when there are any), and
 * `fromLocal` whether anything of this device's is in the result (it then
 * still has to go up).
 */
export function mergeFolder({ base, local, remote }) {
  if (!base || !base.blocks || !base.settings) return null;
  const localBlocks = blocksById(local);
  const remoteBlocks = blocksById(remote);
  if (!localBlocks || !remoteBlocks) return null;

  const conflicts = [];
  let fromLocal = false;
  const blocks = [];
  const place = (id, verdict) => {
    if (verdict.conflict) conflicts.push(`block ${id}`);
    const block = verdict.take === 'local' ? localBlocks.get(id) : remoteBlocks.get(id);
    if (verdict.take === 'local') fromLocal = true;
    if (block !== undefined) blocks.push(block);
  };
  // The other device's order first, then what only this one has, in its order.
  for (const id of remoteBlocks.keys()) {
    place(id, decide(base.blocks[id], localBlocks.get(id), remoteBlocks.get(id), fingerprint));
  }
  for (const id of localBlocks.keys()) {
    if (remoteBlocks.has(id)) continue;
    place(id, decide(base.blocks[id], localBlocks.get(id), undefined, fingerprint));
  }

  const localSettings = local?.modeSettings || {};
  const remoteSettings = remote?.modeSettings || {};
  const modeSettings = {};
  for (const key of new Set([...Object.keys(remoteSettings), ...Object.keys(localSettings)])) {
    const verdict = decide(base.settings[key], localSettings[key], remoteSettings[key], value => settingFingerprint(key, value));
    if (verdict.conflict) conflicts.push(`settings ${key}`);
    if (verdict.take === 'local') fromLocal = true;
    const value = verdict.take === 'local' ? localSettings[key] : remoteSettings[key];
    if (value !== undefined) modeSettings[key] = value;
  }

  // The order of blocks is not anybody's writing: when both moved things, the
  // other device's order stands and the caller fits every block into it.
  const orders = decide(base.orders, local?.modeOrders || {}, remote?.modeOrders || {}, fingerprint);
  const modeOrders = orders.take === 'local' ? local?.modeOrders : remote?.modeOrders;
  if (orders.take === 'local' && !orders.conflict) fromLocal = true;

  // Everything else the folder carries is the other device's, untouched --
  // including fields this version does not know (CLAUDE.md, keep unknown).
  const payload = { ...remote, blocks, modeSettings };
  if (modeOrders !== undefined) payload.modeOrders = modeOrders;
  for (const key of PAYLOAD_STAMPS) delete payload[key];
  return { payload, conflicts, fromLocal };
}

/** Where the fingerprints are kept on this device, per account. */
export const BASE_KEY_PREFIX = 'austavia.cloudBase.';

export function readBases(storage, uid) {
  try {
    const raw = JSON.parse(storage?.getItem(BASE_KEY_PREFIX + uid) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

export function writeBases(storage, uid, bases) {
  try { storage?.setItem(BASE_KEY_PREFIX + uid, JSON.stringify(bases || {})); } catch { /* written again at the next sync */ }
}
