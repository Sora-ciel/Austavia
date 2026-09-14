import { openDB } from 'idb';

const DB_NAME = 'codex-db';
const STORE_NAME = 'blocks';
const FILE_STORE_NAME = 'block-files';
// Audio for Playlist mode. Deliberately its own store, and deliberately never
// uploaded: tracks are megabytes each, so they stay on the device and move
// between devices through export/import instead of the cloud.
const MUSIC_STORE_NAME = 'music-library';
// Key under which the device-local playlist library is kept.
const MUSIC_LIBRARY_KEY = 'library:index';
// The copy a folder had before something replaced it, so a sync that goes
// wrong has a way back. One record per folder holding a short list, newest
// first; see utils/folderSnapshots.js for what goes in it and what is dropped.
//
// Device-local and never uploaded, on purpose: a snapshot is what *this*
// device was holding, which is precisely what no other device has.
const SNAPSHOT_STORE_NAME = 'folder-snapshots';
// Bumped from 2: this DB name/origin was previously shared with an unrelated
// project that left an IndexedDB at version 5 on some machines, and IndexedDB
// refuses to open at a lower version than what already exists there
// (VersionError). The upgrade callback below is idempotent (only creates
// stores if missing), so raising this is safe and doesn't touch existing data.
// Bumped to 8 for the folder-snapshots store. The upgrade only creates stores
// that are missing, so raising it adds the store and touches nothing else.
const DB_VERSION = 8;
const FILE_FIELDS = ['content', 'src', 'trackUrl', 'title', 'tasks'];

function asPayloadWithTimestamp(payload, updatedAt = Date.now()) {
  if (Array.isArray(payload)) {
    return {
      blocks: payload,
      modeOrders: {},
      updatedAt,
      modifiedAt: updatedAt
    };
  }

  if (!payload || typeof payload !== 'object') {
    return {
      blocks: [],
      modeOrders: {},
      updatedAt,
      modifiedAt: updatedAt
    };
  }

  const modifiedAt = payload.modifiedAt || payload.updatedAt || updatedAt;
  return {
    ...payload,
    updatedAt: payload.updatedAt || updatedAt,
    modifiedAt
  };
}


export async function getDB() {
  return await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(FILE_STORE_NAME)) {
        db.createObjectStore(FILE_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(MUSIC_STORE_NAME)) {
        db.createObjectStore(MUSIC_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE_NAME)) {
        db.createObjectStore(SNAPSHOT_STORE_NAME);
      }
    }
  });
}

function decodeBase64(base64) {
  if (typeof atob === 'function') {
    return atob(base64);
  }
  return '';
}

function dataUrlToBlob(dataUrl) {
  const [meta, encoded] = String(dataUrl || '').split(',', 2);
  const mimeMatch = meta?.match(/data:(.*?)(;base64)?$/);
  const mime = mimeMatch?.[1] || 'application/octet-stream';
  const isBase64 = /;base64/i.test(meta || '');
  const binaryString = isBase64 ? decodeBase64(encoded || '') : decodeURIComponent(encoded || '');
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function extensionFromMime(mime = '') {
  const normalized = mime.toLowerCase();
  if (normalized.includes('jpeg')) return 'jpg';
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('svg')) return 'svg';
  if (normalized.includes('mp4')) return 'mp4';
  if (normalized.includes('webm')) return 'webm';
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('plain')) return 'txt';
  if (normalized.includes('json')) return 'json';
  return 'bin';
}

function makeFileKey(saveName, blockId, field, ext) {
  return `${saveName}/${blockId}/${field}.${ext}`;
}

async function blobToDataUrl(blob) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

function cloneBlock(block) {
  return {
    ...block,
    position: { ...(block?.position || {}) },
    size: { ...(block?.size || {}) }
  };
}

function shouldPersistAsFile(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function valueToBlobDescriptor(value, field) {
  if (field === 'src' && typeof value === 'string' && value.startsWith('data:')) {
    const blob = dataUrlToBlob(value);
    const mime = blob.type || 'application/octet-stream';
    return { blob, ext: extensionFromMime(mime), encoding: 'binary', mime };
  }

  if (typeof value === 'object') {
    const blob = new Blob([JSON.stringify(value)], { type: 'application/json' });
    return { blob, ext: 'json', encoding: 'json', mime: 'application/json' };
  }

  const text = String(value);
  const ext = field === 'src' && /^https?:\/\//i.test(text) ? 'url' : 'txt';
  const mime = ext === 'url' ? 'text/uri-list' : 'text/plain';
  const blob = new Blob([text], { type: mime });
  return { blob, ext, encoding: 'text', mime };
}

async function clearSaveFiles(db, saveName) {
  const tx = db.transaction(FILE_STORE_NAME, 'readwrite');
  const store = tx.objectStore(FILE_STORE_NAME);
  const lower = `${saveName}/`;
  const upper = `${saveName}/\uffff`;
  const keys = await store.getAllKeys(IDBKeyRange.bound(lower, upper));
  for (const key of keys) {
    await store.delete(key);
  }
  await tx.done;
}

async function preparePersistedPayload(saveName, payload) {
  const normalized = asPayloadWithTimestamp(payload, Date.now());
  const blocks = (normalized.blocks || []).map(cloneBlock);
  const fileWrites = [];
  const persistedBlocks = blocks.map(block => {
    const next = { ...block };
    const fileRefs = {};

    for (const field of FILE_FIELDS) {
      const value = next[field];
      if (!shouldPersistAsFile(value)) continue;

      const descriptor = valueToBlobDescriptor(value, field);
      const key = makeFileKey(saveName, block.id, field, descriptor.ext);
      fileWrites.push({ key, blob: descriptor.blob });
      fileRefs[field] = {
        key,
        ext: descriptor.ext,
        encoding: descriptor.encoding,
        mime: descriptor.mime
      };
      delete next[field];
    }

    if (Object.keys(fileRefs).length) {
      next.__fileRefs = fileRefs;
    }

    return next;
  });

  return {
    payload: {
      ...normalized,
      blocks: persistedBlocks
    },
    files: fileWrites
  };
}

async function hydratePayload(db, payload) {
  const normalized = asPayloadWithTimestamp(payload || []);
  const hydratedBlocks = [];

  for (const originalBlock of normalized.blocks || []) {
    const block = cloneBlock(originalBlock);
    const refs = block.__fileRefs || {};
    delete block.__fileRefs;

    for (const [field, ref] of Object.entries(refs)) {
      if (!ref?.key) continue;
      const blob = await db.get(FILE_STORE_NAME, ref.key);
      if (!blob) continue;

      if (ref.encoding === 'binary') {
        block[field] = await blobToDataUrl(blob);
      } else if (ref.encoding === 'json') {
        const text = await blob.text();
        try {
          block[field] = JSON.parse(text);
        } catch {
          block[field] = text;
        }
      } else {
        block[field] = await blob.text();
      }
    }

    hydratedBlocks.push(block);
  }

  return {
    ...normalized,
    blocks: hydratedBlocks
  };
}

export async function saveBlocks(name, blocks) {
  const db = await getDB();
  const prepared = await preparePersistedPayload(name, blocks);
  await clearSaveFiles(db, name);

  const tx = db.transaction([STORE_NAME, FILE_STORE_NAME], 'readwrite');
  await tx.objectStore(STORE_NAME).put(prepared.payload, name);
  for (const file of prepared.files) {
    await tx.objectStore(FILE_STORE_NAME).put(file.blob, file.key);
  }
  await tx.done;
}

export async function loadBlocks(name) {
  const db = await getDB();
  const localPayload = await db.get(STORE_NAME, name);
  return await hydratePayload(db, localPayload || []);
}

export async function deleteBlocks(name) {
  const db = await getDB();
  await db.delete(STORE_NAME, name);
  await clearSaveFiles(db, name);
  await db.delete(SNAPSHOT_STORE_NAME, name);
}

// ── Replaced copies ──────────────────────────────────────────────────
// Stored whole rather than split into the file store the way a live folder is.
// A snapshot is written once and read only if somebody asks for it back, so
// the splitting buys nothing and costs a second thing to keep in step.

/** The replaced copies kept for a folder, newest first. */
export async function listFolderSnapshots(name) {
  const db = await getDB();
  const stored = await db.get(SNAPSHOT_STORE_NAME, name);
  return Array.isArray(stored) ? stored : [];
}

/** Writes the whole list back, which is what the trimming rules produce. */
export async function putFolderSnapshots(name, snapshots) {
  const db = await getDB();
  await db.put(SNAPSHOT_STORE_NAME, Array.isArray(snapshots) ? snapshots : [], name);
}

/** Forgets one, by the moment it was taken. */
export async function deleteFolderSnapshot(name, takenAt) {
  const kept = (await listFolderSnapshots(name)).filter(
    (snapshot) => Number(snapshot?.takenAt) !== Number(takenAt)
  );
  await putFolderSnapshots(name, kept);
  return kept;
}

export async function listSavedBlocks() {
  const db = await getDB();
  const keys = await db.getAllKeys(STORE_NAME);
  return keys.map(String);
}

// ── Music library (device-local) ─────────────────────────────────────
// Playlists and track metadata travel with the file through sync; the audio
// itself never leaves the device, which keeps a 100-track library from turning
// into ~500MB of cloud storage and egress. Moving music between devices is
// done with exportMusicLibrary/importMusicTrack instead.

export async function saveMusicTrack(trackId, blob) {
  const db = await getDB();
  await db.put(MUSIC_STORE_NAME, blob, trackId);
}

export async function loadMusicTrack(trackId) {
  const db = await getDB();
  return (await db.get(MUSIC_STORE_NAME, trackId)) || null;
}

export async function deleteMusicTrack(trackId) {
  const db = await getDB();
  await db.delete(MUSIC_STORE_NAME, trackId);
}

/**
 * Remove several tracks, and their cover art, in one go.
 *
 * Deleting one at a time is what made clearing a library slow — and it was
 * never the bytes. `deleteMusicTrack` opens a transaction, commits it and waits;
 * so does `deleteMusicCover`. A loop over a few hundred tracks is therefore a
 * few hundred round trips of fixed cost each, and removing two gigabytes took
 * longer than copying it in. The blobs themselves are freed by a key removal
 * that costs almost nothing.
 *
 * One transaction, every key issued into it without waiting, and a single
 * commit at the end. That also makes it all-or-nothing, which is what you want
 * here: a half-deleted selection leaves audio on the device that the library no
 * longer lists, and nothing would ever look for it again.
 */
export async function deleteMusicTracks(trackIds = []) {
  const ids = [...new Set((trackIds || []).filter(Boolean))];
  if (!ids.length) return 0;

  const db = await getDB();
  const tx = db.transaction(MUSIC_STORE_NAME, 'readwrite');
  for (const id of ids) {
    tx.store.delete(id);
    tx.store.delete(`cover:${id}`);
  }
  await tx.done;
  return ids.length;
}

/**
 * Store several tracks in one transaction.
 *
 * Same reasoning as the delete, with one difference that decides the shape:
 * importing actually moves bytes, so a failure part-way is worth keeping the
 * successful part of. The caller passes a chunk at a time rather than a whole
 * library, so a commit covers a few dozen files and an interrupted import keeps
 * everything up to the last chunk.
 */
export async function saveMusicTracks(entries = []) {
  const list = (entries || []).filter(entry => entry && entry.id && entry.blob);
  if (!list.length) return 0;

  const db = await getDB();
  const tx = db.transaction(MUSIC_STORE_NAME, 'readwrite');
  for (const { id, blob } of list) tx.store.put(blob, id);
  await tx.done;
  return list.length;
}

export async function listMusicTrackIds() {
  const db = await getDB();
  return await db.getAllKeys(MUSIC_STORE_NAME);
}

// Which tracks this device actually holds — used to grey out entries that
// synced in from another device but whose audio hasn't been imported here.
export async function getAvailableMusicIds() {
  const keys = await listMusicTrackIds();
  // The store also holds cover art and the library index; neither is a track.
  return new Set(
    keys.filter(key => {
      const name = String(key);
      return !name.startsWith('cover:') && name !== MUSIC_LIBRARY_KEY;
    })
  );
}

// Cover art lives beside the audio, device-local. It's often 100KB+ per track,
// so like the audio it must never end up in the synced payload.
export async function saveMusicCover(trackId, blob) {
  const db = await getDB();
  await db.put(MUSIC_STORE_NAME, blob, `cover:${trackId}`);
}

export async function loadMusicCover(trackId) {
  const db = await getDB();
  return (await db.get(MUSIC_STORE_NAME, `cover:${trackId}`)) || null;
}

export async function deleteMusicCover(trackId) {
  const db = await getDB();
  await db.delete(MUSIC_STORE_NAME, `cover:${trackId}`);
}

// ── The playlist library, device-local ────────────────────────────
// Titles, artists, playlists and the track list used to ride along in the
// folder's mode settings, which meant they synced to the cloud. Nothing about
// them is useful on another device — the audio itself never leaves this one —
// so they live here instead and stay out of the synced payload entirely.
export async function saveMusicLibrary(library) {
  const db = await getDB();
  await db.put(MUSIC_STORE_NAME, library || { tracks: [], playlists: [] }, MUSIC_LIBRARY_KEY);
}

export async function loadMusicLibrary() {
  const db = await getDB();
  const stored = await db.get(MUSIC_STORE_NAME, MUSIC_LIBRARY_KEY);
  if (!stored) return null;
  return {
    tracks: Array.isArray(stored.tracks) ? stored.tracks : [],
    playlists: Array.isArray(stored.playlists) ? stored.playlists : []
  };
}
