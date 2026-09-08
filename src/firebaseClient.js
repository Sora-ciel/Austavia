import { Capacitor } from '@capacitor/core';
import { firebaseConfig, firebaseSyncNamespace, googleWebClientId } from '../firebase.ts';
// The rules for what may be synced live apart from the code that does the
// syncing, so they can be tested without a browser. See utils/syncRules.js.
import {
  isSyncableFileId,
  findEmbeddedDataUrls,
  payloadCarriesDataUrl
} from './utils/syncRules.js';
// What may be written to themes/, and which of two copies of one theme wins.
// See utils/themeSync.js.
import {
  isSyncableThemeId,
  themeForSync,
  themeFromSync
} from './utils/themeSync.js';
// Which stored attachments no longer belong to a block. See
// utils/attachmentCleanup.js.
import { orphanedAttachmentIds } from './utils/attachmentCleanup.js';


export { firebaseConfig, firebaseSyncNamespace };
export { isSyncableFileId, payloadCarriesDataUrl };

let socialLoginPlugin = null;
let socialLoginInitPromise;

function loadSocialLogin() {
  return import('@capgo/capacitor-social-login');
}

async function ensureNativeGoogleAuthInitialized() {
  // Capacitor plugin proxies expose a callable property for any method name
  // accessed on them, including "then" - so a plugin object must never be
  // returned as a Promise resolution value. JS's Promise "thenable
  // assimilation" would call `plugin.then(...)` to try to unwrap it, which
  // hits the native bridge as a bogus "then" method call and throws
  // "X.then() is not implemented on android". Keep the plugin instance in a
  // plain module-level variable instead, and only ever resolve this promise
  // to a primitive.
  if (!socialLoginInitPromise) {
    socialLoginInitPromise = loadSocialLogin().then(async (mod) => {
      socialLoginPlugin = mod.SocialLogin;
      await socialLoginPlugin.initialize({ google: { webClientId: googleWebClientId } });
      return true;
    });
  }
  await socialLoginInitPromise;
}

/**
 * Get the native Google plugin ready before anybody asks for it.
 *
 * Everything sign-in needs used to happen after the tap: the plugin's own
 * bundle was fetched, `initialize` set up Credential Manager, and only then
 * could the account picker be asked for. Several seconds of a button that
 * looks broken — long enough to press again, or to decide it does not work.
 *
 * None of that depends on who is signing in, so none of it needs to wait for
 * the tap. Called once the app has settled, it moves the whole delay into time
 * nobody is watching, and the tap is left with the picker alone.
 *
 * Deliberately quiet: this is an optimisation, and a failure here must not
 * reach anyone. Sign-in still initialises on demand exactly as before — the
 * promise is shared, so a tap that arrives mid-warm-up waits for the same one
 * rather than starting a second.
 */
export function prewarmGoogleSignIn() {
  if (!Capacitor.isNativePlatform()) return;
  if (!googleWebClientId) return;
  ensureNativeGoogleAuthInitialized().catch(() => {});
}

async function signInWithGoogleNative(ctx) {
  if (!googleWebClientId) {
    throw new Error('Google sign-in is not configured for this app (missing web client ID).');
  }

  await ensureNativeGoogleAuthInitialized();
  // Drop any cached Google session first, otherwise the plugin signs straight
  // back into the last account and the picker never appears — leaving people
  // stuck on whichever account they first used.
  await socialLoginPlugin.logout({ provider: 'google' }).catch(() => {});
  // The plugin already requests email/profile/openid scopes by default.
  // Passing custom `scopes` here triggers a native check that requires
  // modifying MainActivity to implement ModifiedMainActivityForSocialLoginPlugin,
  // which isn't needed since the defaults already cover what we use.
  const { result } = await socialLoginPlugin.login({
    provider: 'google'
  });

  const idToken = result?.idToken;
  if (!idToken) throw new Error('Google sign-in did not return an ID token.');

  const credential = ctx.authApi.GoogleAuthProvider.credential(idToken);
  const signInResult = await ctx.authApi.signInWithCredential(ctx.auth, credential);
  return signInResult.user;
}

const REQUIRED_FIREBASE_KEYS = [
  'apiKey',
  'authDomain',
  'projectId',
  'appId',
  'databaseURL'
];

const FIREBASE_SDK_VERSION = '11.7.0';
const ATTACHMENT_FIELDS = ['src', 'content', 'trackUrl'];

// Bump when the shape of a synced file payload changes in a way older
// instances can't read as-is. The backend migrates old payloads forward on
// write, so older/newer instances don't need to know about each other.
export const SYNC_SCHEMA_VERSION = 1;

let firebaseModulesPromise;
let firebaseContextPromise;

function loadFirebaseModules() {
  if (!firebaseModulesPromise) {
    firebaseModulesPromise = Promise.all([
      import(/* @vite-ignore */ `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
      import(/* @vite-ignore */ `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`),
      import(/* @vite-ignore */ `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-database.js`),
      import(/* @vite-ignore */ `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-storage.js`)
    ]).then(([app, auth, database, storage]) => ({ app, auth, database, storage }));
  }
  return firebaseModulesPromise;
}

async function getFirebaseContext() {
  if (!isFirebaseConfigured()) return null;
  if (!firebaseContextPromise) {
    firebaseContextPromise = loadFirebaseModules().then(({ app, auth, database, storage }) => {
      const firebaseApp = app.getApps().length
        ? app.getApp()
        : app.initializeApp(firebaseConfig);
      const firebaseAuth = auth.getAuth(firebaseApp);
      auth.setPersistence(firebaseAuth, auth.browserLocalPersistence).catch(() => {});
      const firebaseDb = database.getDatabase(firebaseApp);
      const firebaseStorage = storage.getStorage(firebaseApp);
      return { app: firebaseApp, auth: firebaseAuth, db: firebaseDb, storage: firebaseStorage, authApi: auth, dbApi: database, storageApi: storage };
    });
  }
  return firebaseContextPromise;
}

// Where a picture already sent to Storage ended up, so the same one is not
// pushed twice in a session. Keyed by object path, which is derived from the
// bytes, so two blocks holding the same picture share the upload.
const uploadedAttachmentUrls = new Map();

// FNV-1a. Short, stable and good enough to name an object by its contents;
// nothing here depends on it being hard to forge.
function hashText(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36) + '-' + text.length.toString(36);
}

function inferExtensionFromMime(mime = '') {
  const normalized = String(mime).toLowerCase();
  if (normalized.includes('jpeg')) return 'jpg';
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('svg')) return 'svg';
  if (normalized.includes('mp4')) return 'mp4';
  if (normalized.includes('webm')) return 'webm';
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('mpeg')) return 'mp3';
  return 'bin';
}

// A picture is not always the whole of a value. An image block's src is
// nothing but the data: URL, which is all `startsWith('data:')` ever caught —
// but a picture pasted into written text arrives *inside* the value, as an
// <img src="data:…"> in a note's HTML or a ![](data:…) in a task. Those were
// never recognised, so the base64 went into the database inline: megabytes of
// it in a single field, and the write carrying it failed. One failed write
// stopped the whole upload loop, so the note stopped syncing and every note
// behind it in the queue stopped with it.
//
// Both shapes are matched here. A base64 payload contains no quote, bracket or
// space, which is what bounds each match.
/**
 * Replaces every data: URL embedded in a string with a Storage link. The same
 * picture used twice is uploaded once.
 */
async function uploadEmbeddedDataUrls(text, options) {
  const dataUrls = findEmbeddedDataUrls(text);
  if (!dataUrls.length) return text;

  let replaced = text;
  for (const dataUrl of dataUrls) {
    const uploadedUrl = await uploadAttachmentFromDataUrl(dataUrl, options);
    if (uploadedUrl) replaced = replaced.split(dataUrl).join(uploadedUrl);
  }
  return replaced;
}

async function uploadBlockAttachments(fileId, payload, ctx, uid) {
  if (!Array.isArray(payload?.blocks)) return payload;

  const blocks = await Promise.all(payload.blocks.map(async (block, index) => {
    const next = { ...block };
    const blockId = block?.id || `block-${index + 1}`;

    // Tasks used to be plain text holding markdown; they hold HTML now, so the
    // picture in one is written <img src="data:…"> and the old markdown-only
    // test stopped matching. Both shapes go through the same path now.
    if (Array.isArray(next.tasks)) {
      next.tasks = await Promise.all(next.tasks.map(async task => {
        const text = task?.text;
        if (typeof text !== 'string') return task;

        const replaced = await uploadEmbeddedDataUrls(text, {
          fileId,
          blockId,
          field: `task-${task?.id || 'item'}`,
          uid,
          ctx
        });
        return replaced === text ? task : { ...task, text: replaced };
      }));
    }

    for (const field of ATTACHMENT_FIELDS) {
      const value = next[field];
      if (typeof value !== 'string') continue;

      // The value *is* the picture — an image block's src.
      if (value.startsWith('data:')) {
        const uploadedUrl = await uploadAttachmentFromDataUrl(value, {
          fileId,
          blockId,
          field,
          uid,
          ctx
        });

        if (uploadedUrl) {
          next[field] = uploadedUrl;
        }
        continue;
      }

      // The picture is somewhere inside written text.
      if (value.includes('data:')) {
        next[field] = await uploadEmbeddedDataUrls(value, {
          fileId,
          blockId,
          field,
          uid,
          ctx
        });
      }
    }

    return next;
  }));

  return {
    ...payload,
    blocks
  };
}

// Single Note's background images live in modeSettings, not on a block, so the
// loop above never saw them — they'd have gone into the database inline as
// base64, which is far too large to sync. Push them to Storage like any other
// attachment. Desktop and phone keep their own slot, so each device still gets
// the image picked for it.
const SINGLE_NOTE_IMAGE_FIELDS = ['backgroundImage', 'backgroundImageMobile'];

async function uploadModeSettingAttachments(fileId, payload, ctx, uid) {
  const single = payload?.modeSettings?.single;
  if (!single) return payload;

  let changed = false;
  const nextSingle = { ...single };

  for (const field of SINGLE_NOTE_IMAGE_FIELDS) {
    const value = nextSingle[field];
    if (typeof value !== 'string' || !value.startsWith('data:')) continue;

    const uploadedUrl = await uploadAttachmentFromDataUrl(value, {
      fileId,
      blockId: 'mode-settings',
      field,
      uid,
      ctx
    });
    if (uploadedUrl) {
      nextSingle[field] = uploadedUrl;
      changed = true;
    }
  }

  if (!changed) return payload;
  return {
    ...payload,
    modeSettings: { ...payload.modeSettings, single: nextSingle }
  };
}

function normalizeNamespace() {
  return firebaseSyncNamespace || 'default';
}

function getUserPath(uid, suffix = '') {
  const ns = normalizeNamespace();
  return `sync/${ns}/users/${uid}/${suffix}`.replace(/\/$/, '');
}

function getStorageUserPath(uid, suffix = '') {
  return `users/${uid}/${suffix}`.replace(/\/$/, '');
}

function requireUser(user) {
  if (!user) throw new Error('Please sign in with Google first.');
  return user;
}

export function isFirebaseConfigured() {
  return REQUIRED_FIREBASE_KEYS.every(key => {
    const value = firebaseConfig?.[key];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

export function getCurrentUser() {
  return null;
}

export function onAuthStateChange(callback) {
  let unsub = () => {};
  let cancelled = false;

  getFirebaseContext()
    .then(ctx => {
      if (cancelled || !ctx) {
        callback?.(null);
        return;
      }
      unsub = ctx.authApi.onAuthStateChanged(ctx.auth, callback);
    })
    .catch(() => {
      callback?.(null);
    });

  return () => {
    cancelled = true;
    unsub();
  };
}

export async function signInWithGoogle() {
  const ctx = await getFirebaseContext();
  if (!ctx) throw new Error('Firebase is not configured.');

  if (Capacitor.isNativePlatform()) {
    return signInWithGoogleNative(ctx);
  }

  const provider = new ctx.authApi.GoogleAuthProvider();
  // Without this Google silently reuses whichever account is already signed in
  // to the browser, so anyone with a single session could never reach a second
  // one. Always offer the picker instead.
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await ctx.authApi.signInWithPopup(ctx.auth, provider);
  return result.user;
}

export async function signOutUser() {
  const ctx = await getFirebaseContext();
  if (!ctx) return;

  if (Capacitor.isNativePlatform() && socialLoginInitPromise) {
    await socialLoginInitPromise;
    await socialLoginPlugin?.logout({ provider: 'google' }).catch(() => {});
  }

  await ctx.authApi.signOut(ctx.auth);
}

export async function loadRemoteFile(fileId) {
  if (!isFirebaseConfigured()) return null;
  const ctx = await getFirebaseContext();
  const user = requireUser(ctx.auth.currentUser);

  const snapshot = await ctx.dbApi.get(
    ctx.dbApi.ref(ctx.db, getUserPath(user.uid, `files/${fileId}`))
  );

  return snapshot.exists() ? snapshot.val() : null;
}

// Lets old and new instances share the same sync data without either one
// needing upgrade-aware code baked in: the backend migrates payloads to
// `latest` on write, and only refuses to sync if this client is older than
// `minSupported` (a breaking change the backend can't shim around).
export async function checkSyncCompatibility() {
  if (!isFirebaseConfigured()) return { compatible: true };
  const ctx = await getFirebaseContext();
  if (!ctx) return { compatible: true };

  const snapshot = await ctx.dbApi.get(
    ctx.dbApi.ref(ctx.db, `sync/${normalizeNamespace()}/meta/schemaVersion`)
  );
  const meta = snapshot.exists() ? snapshot.val() : null;
  const minSupported = Number(meta?.minSupported || 0);

  return {
    compatible: SYNC_SCHEMA_VERSION >= minSupported,
    latest: Number(meta?.latest || SYNC_SCHEMA_VERSION),
    minSupported
  };
}

export async function loadRemoteIndex() {
  if (!isFirebaseConfigured()) return {};
  const ctx = await getFirebaseContext();
  const user = requireUser(ctx.auth.currentUser);

  const snapshot = await ctx.dbApi.get(
    ctx.dbApi.ref(ctx.db, getUserPath(user.uid, 'index'))
  );

  return snapshot.exists() ? snapshot.val() : {};
}

// Push-based replacement for polling loadRemoteIndex() on a timer: RTDB only
// sends bytes when the index actually changes, instead of a full get() every tick.
export function subscribeRemoteIndex(callback) {
  let detach = () => {};
  let cancelled = false;

  getFirebaseContext()
    .then(ctx => {
      if (cancelled || !ctx) return;
      const user = ctx.auth.currentUser;
      if (!user) return;

      const indexRef = ctx.dbApi.ref(ctx.db, getUserPath(user.uid, 'index'));
      const unsubscribe = ctx.dbApi.onValue(
        indexRef,
        snapshot => callback(snapshot.exists() ? snapshot.val() : {}),
        error => console.error('Remote index subscription failed:', error)
      );
      detach = unsubscribe;
    })
    .catch(error => console.error('Failed to start remote index subscription:', error));

  return () => {
    cancelled = true;
    detach();
  };
}

export async function saveRemoteFile(fileId, payload, options = {}) {
  if (!isFirebaseConfigured()) return null;
  // Refused rather than sent and rejected: see isSyncableFileId. A blank name
  // here would overwrite every folder in the account.
  if (!isSyncableFileId(fileId)) {
    throw new Error(
      `"${fileId}" cannot be stored in the cloud: a folder name must not be empty ` +
      'or contain . # $ [ ] or /'
    );
  }
  const ctx = await getFirebaseContext();
  const user = requireUser(ctx.auth.currentUser);
  // The caller skips the attachment pass when it believes nothing has changed.
  // That belief is only ever about *pictures*, and it was wrong often enough to
  // matter: the copy on this device keeps its base64 after an upload, so a note
  // whose picture had already been sent still carried the inline bytes, and the
  // next ordinary text edit wrote all of them to the database. Whatever the
  // caller thinks, a payload still holding a data: URL gets the pass.
  const shouldUploadAttachments =
    options.uploadAttachments !== false || payloadCarriesDataUrl(payload);
  let payloadWithRemoteAttachments = payload;
  if (shouldUploadAttachments) {
    payloadWithRemoteAttachments = await uploadBlockAttachments(fileId, payload, ctx, user.uid);
    payloadWithRemoteAttachments = await uploadModeSettingAttachments(
      fileId, payloadWithRemoteAttachments, ctx, user.uid
    );
  }
  const updatedAt = payload?.updatedAt || Date.now();
  const modifiedAt = payload?.modifiedAt || payload?.updatedAt || Date.now();
  const lastSyncedAt = Date.now();

  await ctx.dbApi.set(
    ctx.dbApi.ref(ctx.db, getUserPath(user.uid, `files/${fileId}`)),
    { ...payloadWithRemoteAttachments, updatedAt, modifiedAt, lastSyncedAt, schemaVersion: SYNC_SCHEMA_VERSION }
  );

  await ctx.dbApi.set(
    ctx.dbApi.ref(ctx.db, getUserPath(user.uid, `index/${fileId}`)),
    {
      fileId,
      updatedAt,
      modifiedAt,
      lastSyncedAt,
      blockCount: Array.isArray(payloadWithRemoteAttachments?.blocks) ? payloadWithRemoteAttachments.blocks.length : 0
    }
  );

  return { fileId, updatedAt };
}

// Storage has no notion of deleting a folder, so a prefix has to be walked and
// each object removed. Attachments nest as
// attachments/{fileId}/{blockId}/{field}/{object}, hence the recursion.
async function deleteStorageFolder(ctx, path) {
  const folderRef = ctx.storageApi.ref(ctx.storage, path);
  const listing = await ctx.storageApi.listAll(folderRef);
  await Promise.all([
    ...listing.items.map(item => ctx.storageApi.deleteObject(item)),
    ...listing.prefixes.map(prefix => deleteStorageFolder(ctx, prefix.fullPath))
  ]);
}

export async function deleteRemoteFile(fileId) {
  if (!isFirebaseConfigured()) return null;
  const ctx = await getFirebaseContext();
  const user = requireUser(ctx.auth.currentUser);

  await Promise.all([
    ctx.dbApi.remove(ctx.dbApi.ref(ctx.db, getUserPath(user.uid, `files/${fileId}`))),
    ctx.dbApi.remove(ctx.dbApi.ref(ctx.db, getUserPath(user.uid, `index/${fileId}`)))
  ]);

  // The note's images and other attachments used to be left behind here,
  // costing storage forever and keeping content that the user believes they
  // deleted. Done after the database records are gone, and never allowed to
  // fail the delete: a leftover object is a smaller problem than a folder that
  // won't go away.
  try {
    await deleteStorageFolder(ctx, getStorageUserPath(user.uid, `attachments/${fileId}`));
  } catch (error) {
    console.warn('Could not remove attachments for the deleted file:', error);
  }

  return { fileId };
}

// Watches this account's stored-byte record.
//
// Push rather than poll, like the remote index: the server rewrites the whole
// record on every upload and delete, so the app sees a new total the moment
// one lands instead of on a timer. The node is readable by its owner and by
// nobody else — database.rules.json grants storage/{uid} to that uid alone.
export function subscribeStorageUsage(callback) {
  let detach = () => {};
  let cancelled = false;

  getFirebaseContext()
    .then(ctx => {
      if (cancelled || !ctx) return;
      const user = ctx.auth.currentUser;
      if (!user) return;

      const usageRef = ctx.dbApi.ref(ctx.db, `storage/${user.uid}`);
      const unsubscribe = ctx.dbApi.onValue(
        usageRef,
        snapshot => callback(snapshot.exists() ? snapshot.val() : null),
        error => console.warn('Storage usage subscription failed:', error)
      );
      detach = unsubscribe;
    })
    .catch(error => console.warn('Storage usage subscription failed:', error));

  return () => {
    cancelled = true;
    detach();
  };
}

// Removes the uploads left behind by blocks that no longer exist.
//
// Deleting an image block never removed its upload: attachments were only
// cleaned up when a whole folder was deleted, so a picture taken out of a note
// stayed in the bucket for good, invisible and charged for. Harmless while
// storage was free; not harmless when storage is what is being sold, and
// actively broken once a ceiling exists — deleting is the only way out of a
// full account, and it did not give the space back.
//
// Compares against what storage actually holds rather than against deletions
// remembered as they happened, because remembering is wrong in both
// directions: an undo restores a block while the memory still says to delete
// it, and a redo removes one again without the memory noticing.
export async function sweepOrphanBlockAttachments(fileId, keepBlockIds = []) {
  if (!isFirebaseConfigured()) return null;

  // A blank fileId would make `attachments/`, whose trailing slash is
  // stripped, and this function deletes what it is pointed at.
  if (!isSyncableFileId(fileId)) return null;

  const ctx = await getFirebaseContext();
  const user = requireUser(ctx.auth.currentUser);

  const root = getStorageUserPath(user.uid, `attachments/${fileId}`);
  const listing = await ctx.storageApi.listAll(ctx.storageApi.ref(ctx.storage, root));

  const orphans = orphanedAttachmentIds(
    listing.prefixes.map(prefix => prefix.name),
    keepBlockIds
  );

  for (const blockId of orphans) {
    await deleteStorageFolder(ctx, `${root}/${blockId}`);
  }

  return { removed: orphans };
}

// ── Custom themes ───────────────────────────────────────────────────────────
//
// One node per theme under themes/{themeId}, synced whole. A theme is looked
// at as a whole or not at all, so there is nothing to gain from merging it a
// field at a time and a great deal to lose — two devices could each end up
// holding half of a theme nobody designed.
//
// Every id goes through isSyncableThemeId before it reaches a path. A blank
// one would make `themes/`, whose trailing slash is stripped, and the write
// would land on the node holding every theme and replace the lot — the same
// way a blank folder name once threatened every folder.

export async function loadRemoteThemes() {
  if (!isFirebaseConfigured()) return [];
  const ctx = await getFirebaseContext();
  const user = requireUser(ctx.auth.currentUser);

  const snapshot = await ctx.dbApi.get(
    ctx.dbApi.ref(ctx.db, getUserPath(user.uid, 'themes'))
  );
  if (!snapshot.exists()) return [];

  return Object.values(snapshot.val() || {})
    .map(themeFromSync)
    .filter(Boolean);
}

export async function saveRemoteTheme(theme) {
  if (!isFirebaseConfigured()) return null;

  const payload = themeForSync(theme);
  if (!payload) return null;

  const ctx = await getFirebaseContext();
  const user = requireUser(ctx.auth.currentUser);

  await ctx.dbApi.set(
    ctx.dbApi.ref(ctx.db, getUserPath(user.uid, `themes/${payload.id}`)),
    payload
  );

  return payload;
}

export async function deleteRemoteTheme(themeId) {
  if (!isFirebaseConfigured()) return null;
  if (!isSyncableThemeId(themeId)) return null;

  const ctx = await getFirebaseContext();
  const user = requireUser(ctx.auth.currentUser);

  await ctx.dbApi.remove(
    ctx.dbApi.ref(ctx.db, getUserPath(user.uid, `themes/${themeId}`))
  );

  return { themeId };
}

export async function uploadAttachmentFromDataUrl(dataUrl, options = {}) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;

  const ctx = options.ctx || await getFirebaseContext();
  if (!ctx) return null;

  const uid = options.uid || requireUser(ctx.auth.currentUser).uid;
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const mime = blob.type || 'application/octet-stream';
  const ext = inferExtensionFromMime(mime);
  const fileId = String(options.fileId || 'unknown-file');
  const blockId = String(options.blockId || 'unknown-block');
  const field = String(options.field || 'attachment');
  // Named after the bytes rather than the clock. Uploading is not a one-time
  // event: the copy on this device keeps its base64, so the same picture comes
  // back round on every later edit of the note. With a random name each pass
  // left another copy in Storage; named this way a repeat simply overwrites the
  // one already there, and the link stays the same.
  const objectName = `${hashText(dataUrl)}.${ext}`;
  const objectPath = `${getStorageUserPath(uid, `attachments/${fileId}/${blockId}/${field}`)}/${objectName}`;

  const cached = uploadedAttachmentUrls.get(objectPath);
  if (cached) return cached;

  const storageRef = ctx.storageApi.ref(ctx.storage, objectPath);

  await ctx.storageApi.uploadBytes(storageRef, blob, {
    contentType: mime,
    cacheControl: 'public,max-age=31536000'
  });

  const downloadUrl = await ctx.storageApi.getDownloadURL(storageRef);
  uploadedAttachmentUrls.set(objectPath, downloadUrl);
  return downloadUrl;
}

export async function resolveAttachmentUrl(value) {
  return value || null;
}

export async function resolveAttachmentURL(value) {
  return resolveAttachmentUrl(value);
}
