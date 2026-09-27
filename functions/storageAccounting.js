// Everything that keeps the per-account stored-byte balance, kept out of
// index.js so it can be imported and exercised without a Cloud Functions
// runtime — index.js is left holding only the trigger wiring. Same split as
// src/utils/syncRules.js on the client side.

const { logger } = require('firebase-functions');
const { getDatabase } = require('firebase-admin/database');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');
const { SYNC_NAMESPACE } = require('./syncNamespace');
const { componentsOf, withComponent, totalNoteBytes } = require('./accountBytes');
const { DEFAULT_PLAN, storageLimitFor, isOverStorageLimit, storableLimit } = require('./limits');
const {
  uidFromObjectName,
  nextClaims,
  claimsChanged,
  tallyByUid,
  withZeroedMissing,
  isStaleScan
} = require('./storageUsage');
// --- Stored bytes ------------------------------------------------------
//
// enforceSyncQuota above counts what a note weighs in the database, which
// stopped being most of the data the day attachments moved to Cloud Storage:
// a 40 MB upload writes a few hundred bytes of ref into RTDB and the rest is
// invisible to it. The per-object ceiling in storage.rules bounds a single
// upload; nothing bounded the total, so an account could hold an unlimited
// number of them.
//
// These two keep a running total per user under storage/{uid}. It is a
// balance, not a daily tally: it goes up on upload, down on delete, and is
// never reset — resetDailyBlocks must not touch it, which is why it lives in
// its own node with its own flag rather than beside the bandwidth counters.
//
// An overwrite fires both triggers: the replaced generation is deleted and the
// new one finalized, so the arithmetic stays balanced without special-casing.

// Storage rules cannot read the database — they can read Firestore, but not
// RTDB — so the ceiling cannot be enforced by looking the total up at upload
// time. A custom claim on the user's own token can be read (as
// request.auth.token.storageFull), so that is what storage.rules checks.
//
// The cost is latency: an ID token is refreshed about hourly, so a client
// holding a fresh token can keep uploading for up to that long after going
// over. That is acceptable for a cost guard — the overshoot is bounded by an
// hour of one account's uploads — and it is not acceptable for anything that
// needs to be exact, which is why the number itself lives in the database
// where it is written the moment an object lands.
async function syncStorageFullClaim(uid, isFull) {
  const auth = getAuth();

  let user;
  try {
    user = await auth.getUser(uid);
  } catch (error) {
    // The account is gone but its objects are still being swept up, or the
    // uid came from a path no account ever owned. Either way there is no
    // token to stamp.
    logger.warn('storage-claim-no-user', { uid, code: error.code });
    return;
  }

  const before = user.customClaims || {};
  const after = nextClaims(before, { storageFull: isFull });
  if (!claimsChanged(before, after)) return;

  await auth.setCustomUserClaims(uid, after);
  logger.info('storage-claim-updated', { uid, storageFull: isFull });
}

// Read one account's plan rather than the whole users node. Reading
// sync/{ns}/users in one go would pull every note every user has along with
// it — the plan is a leaf on the same branch as the entire file store.
async function planFor(db, uid) {
  const snap = await db.ref(`sync/${SYNC_NAMESPACE}/users/${uid}/plan`).get();
  return snap.val() || DEFAULT_PLAN;
}

async function recordStorageDelta(objectName, deltaBytes) {
  const uid = uidFromObjectName(objectName);
  if (!uid || !deltaBytes) return;

  const db = getDatabase();

  // Read before the transaction, so the whole record can be written in one
  // step below. This used to bump `bytes` and then write `limit` and `full`
  // separately, which left a window where the record was half updated — a new
  // total against the old verdict. The app reads this to say "you have used X
  // of Y", so that window was visible, and it made the trigger test flaky in a
  // way that was telling the truth.
  const plan = await planFor(db, uid);
  const limit = storageLimitFor(plan);

  // Transacting the whole record rather than just the byte count keeps two
  // uploads landing at once from racing, and keeps every field agreeing with
  // every other.
  //
  // Clamped at zero: a delete that arrives without its matching upload —
  // objects that predate this function, or a replayed event — would otherwise
  // drive the balance negative and hand the account free space.
  const result = await db.ref(`storage/${uid}`).transaction(current => {
    const objectBytes = Math.max(0, Number((current && current.bytes) || 0) + deltaBytes);
    // The other half is left exactly as it was -- this trigger knows about
    // Cloud Storage and nothing else. withComponent adds them up so the two
    // components and the total can never disagree.
    const next = withComponent(current, 'bytes', objectBytes);

    return {
      ...next,
      // The plan travels with the ceiling it produced. The app subscribes to
      // this node already, and without the name here it can only guess the
      // plan from the size of the limit -- which means a price change silently
      // turns a paying account back into one being offered an upgrade.
      plan,
      limit: storableLimit(limit),
      full: isOverStorageLimit(next.total, plan),
      updatedAt: Date.now()
    };
  });

  const totalBytes = componentsOf(result.snapshot.val()).total;
  const isFull = isOverStorageLimit(totalBytes, plan);

  if (isFull) {
    logger.error('storage-quota-exceeded', { uid, totalBytes, plan, limit });
  }

  await syncStorageFullClaim(uid, isFull);
}

// Recomputes every balance from what is actually in the bucket.
//
// The triggers above are the fast path and the reason a limit can be enforced
// at all, but they are only ever as right as the last event they heard. A
// trigger that times out, a retry that never lands, an object written by
// anything other than the app, or the entire history of uploads that predates
// them — every one of those leaves the balance wrong from that point on, for
// good, because nothing else ever recomputes it. Drift in this number is not
// cosmetic: too low and the ceiling never fires, too high and a paying account
// is locked out of a bucket that has room.
//
// Also the backfill. The first run is what gives accounts that uploaded before
// any of this existed a balance other than zero.
async function reconcileStorageUsage() {
  const scanStartedAt = Date.now();
  const db = getDatabase();
  const bucket = getStorage().bucket();

  // Paged deliberately. autoPaginate would buffer the whole bucket listing in
  // memory before returning anything, which is fine at four objects and not at
  // four hundred thousand.
  const totals = {};
  let pageToken;
  let objectsScanned = 0;

  do {
    const [files, nextQuery] = await bucket.getFiles({
      autoPaginate: false,
      maxResults: 1000,
      pageToken
    });

    objectsScanned += files.length;

    const page = tallyByUid(
      files.map(file => ({ name: file.name, size: file.metadata && file.metadata.size }))
    );
    for (const [uid, bytes] of Object.entries(page)) {
      totals[uid] = (totals[uid] || 0) + bytes;
    }

    pageToken = nextQuery && nextQuery.pageToken;
  } while (pageToken);

  const existingSnap = await db.ref('storage').get();
  const knownUids = existingSnap.exists() ? Object.keys(existingSnap.val() || {}) : [];
  const finalTotals = withZeroedMissing(totals, knownUids);

  let corrected = 0;
  let skipped = 0;

  for (const [uid, bytes] of Object.entries(finalTotals)) {
    const plan = await planFor(db, uid);
    const limit = storageLimitFor(plan);

    // The other half, re-added from what each folder was last measured at.
    // Absolute with respect to those numbers rather than to the folders
    // themselves: re-reading every payload would mean downloading every note
    // in the account, pictures and all, once a week. A folder's recorded size
    // can only be wrong if its own trigger was missed, and the next write of
    // that folder corrects it.
    const noteSizes = (await db.ref(`noteSizes/${uid}`).get()).val();
    const noteBytes = totalNoteBytes(noteSizes);
    const total = bytes + noteBytes;
    const isFull = isOverStorageLimit(total, plan);

    // The staleness guard lives inside the transaction so the check and the
    // write cannot be separated by an upload landing between them.
    const result = await db.ref(`storage/${uid}`).transaction(current => {
      if (isStaleScan(current, scanStartedAt)) return undefined; // abort
      return {
        bytes,
        noteBytes,
        total,
        plan,
        limit: storableLimit(limit),
        full: isFull,
        updatedAt: Date.now()
      };
    });

    if (!result.committed) {
      skipped += 1;
      continue;
    }

    corrected += 1;
    await syncStorageFullClaim(uid, isFull);
  }

  logger.info('storage-reconciled', {
    objectsScanned,
    accounts: Object.keys(finalTotals).length,
    corrected,
    skippedAsNewer: skipped,
    totalBytes: Object.values(finalTotals).reduce((sum, n) => sum + n, 0)
  });
}

/**
 * What one folder weighs, and what that makes the account's notes weigh.
 *
 * Asked for on 2026-09-27: "I wanted the storage to count everything that is
 * synced in an account folder." Until now the balance was Cloud Storage
 * objects only, so an account could hold a hundred megabytes of notes -- and
 * every picture pasted into writing, which lives as a data URL inside the
 * folder's payload -- and still read as empty.
 *
 * Per folder rather than as a running total, for the reason every other
 * balance here is: a size written down per folder can be re-added at any time
 * and comes out the same, while a total nudged by deltas is wrong for ever
 * after one missed trigger.
 */
async function recordNoteBytes(db, uid, fileId, bytes) {
  if (!uid || !fileId) return;

  const sizeRef = db.ref(`noteSizes/${uid}/${fileId}`);
  if (bytes > 0) await sizeRef.set(bytes);
  else await sizeRef.remove(); // the folder is gone; so is its size

  const sizes = (await db.ref(`noteSizes/${uid}`).get()).val();
  const noteBytes = totalNoteBytes(sizes);

  const plan = await planFor(db, uid);
  const limit = storageLimitFor(plan);

  const result = await db.ref(`storage/${uid}`).transaction(current => {
    // Leaves the Cloud Storage half alone, exactly as recordStorageDelta
    // leaves this one alone.
    const next = withComponent(current, 'noteBytes', noteBytes);

    return {
      ...next,
      plan,
      limit: storableLimit(limit),
      full: isOverStorageLimit(next.total, plan),
      updatedAt: Date.now()
    };
  });

  const total = componentsOf(result.snapshot.val()).total;
  const isFull = isOverStorageLimit(total, plan);

  logger.info('note-bytes-recorded', { uid, fileId, bytes, noteBytes, total, full: isFull });
  await syncStorageFullClaim(uid, isFull);
}

module.exports = {
  syncStorageFullClaim,
  planFor,
  recordStorageDelta,
  recordNoteBytes,
  reconcileStorageUsage
};
