const { onValueWritten } = require('firebase-functions/v2/database');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { onObjectFinalized, onObjectDeleted } = require('firebase-functions/v2/storage');
const { logger } = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { LATEST_SCHEMA_VERSION, MIN_SUPPORTED_SCHEMA_VERSION, migrateFilePayload } = require('./migrations');
const { DAILY_BYTE_LIMIT } = require('./limits');
const { SYNC_NAMESPACE } = require('./syncNamespace');
const { recordStorageDelta, recordNoteBytes, reconcileStorageUsage } = require('./storageAccounting');
const { recordActivity, rollUpStats } = require('./activityTracking');
const { verifyWebhook, eventAtFrom } = require('./polarAdapter');
const { applyPolarEvent, sweepExpiredPlans } = require('./subscriptions');
const { apiBaseFor, runningProject } = require('./polarApi');

initializeApp();

// Ceiling on concurrent instances. Without one, a burst of saves — whether a
// genuine crowd or someone hammering the endpoint — scales this function out
// without limit, and the bill with it. The quota guard fires on every index
// write, so it is the one most exposed to that; 10 is comfortably above normal
// load while keeping a runaway bounded. Raise it once real usage justifies it.
const MAX_INSTANCES = 10;
// The scheduled jobs run once a day and never need more than one.
const SCHEDULED_MAX_INSTANCES = 1;

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}

function byteSizeOf(value) {
  if (value === null || value === undefined) return 0;
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

// Tallies bytes written per user per day and flips `blocked` once a user
// crosses DAILY_BYTE_LIMIT. Enforcement itself lives in database.rules.json,
// which denies writes while `blocked` is true — this function only decides
// when to set/clear that flag.
//
// Triggers on index/{fileId} (always tiny, fixed-shape) rather than
// files/{fileId} (the full note, rewritten whole on every edit) — a trigger
// on files/{fileId} previously broke live saving with TRIGGER_PAYLOAD_TOO_LARGE
// once a note grew past RTDB's payload ceiling for watched paths. The real
// byte count still comes from files/{fileId}, just via a plain Admin SDK read
// inside the handler, which isn't subject to that same trigger-delivery limit.
exports.enforceSyncQuota = onValueWritten(
  {
    ref: 'sync/{ns}/users/{uid}/index/{fileId}',
    region: 'us-central1',
    maxInstances: MAX_INSTANCES
  },
  async event => {
    const { ns, uid, fileId } = event.params;
    logger.info('enforceSyncQuota-start', { ns, uid, fileId, afterExists: event.data.after.exists() });

    if (!event.data.after.exists()) {
      // Nothing to charge for a delete -- but the folder's stored size goes
      // with it, or an account would carry the weight of folders it no longer
      // has and never get that room back.
      await recordNoteBytes(getDatabase(), uid, fileId, 0);
      return;
    }

    // Stamped here rather than from its own trigger: this one already fires on
    // every sync write, and a save is the definition of active worth having.
    // Coarsened to once an hour inside, so typing does not multiply writes.
    // Deliberately not awaited alongside the quota work below — a failure to
    // record a statistic must never interfere with enforcing a limit.
    recordActivity(uid).catch(error =>
      logger.warn('activity-stamp-failed', { uid, message: error.message })
    );

    const db = getDatabase();
    const fileSnap = await db.ref(`sync/${ns}/users/${uid}/files/${fileId}`).get();
    const writtenBytes = byteSizeOf(fileSnap.exists() ? fileSnap.val() : null);
    logger.info('enforceSyncQuota-read', { fileExists: fileSnap.exists(), writtenBytes });
    if (writtenBytes === 0) return;

    // Two different questions about the same bytes, and they are not the same
    // limit. Bandwidth is what this account has *written today*, a cost guard
    // that resets at midnight. The folder's size is what it is *keeping*, and
    // that is what a plan is sold in -- see accountBytes.js. Counting only the
    // first is how an account could hold a hundred megabytes of notes and read
    // as empty.
    await recordNoteBytes(db, uid, fileId, writtenBytes, event.data.after.val()?.updatedAt);
    await chargeBandwidth(db, ns, uid, writtenBytes);
  }
);

// Charges bytes against today's tally and blocks the account if that puts it
// over. Shared, because every path a client can write through has to be
// metered by the same counter — an unmetered one is not a smaller hole than
// no counter at all, it is the same hole with fewer people looking at it.
async function chargeBandwidth(db, ns, uid, writtenBytes) {
  if (!writtenBytes || writtenBytes <= 0) return;

  const usageResult = await db
    .ref(`usage/${uid}/${todayKey()}`)
    .transaction(current => (current || 0) + writtenBytes);
  const totalToday = usageResult.snapshot.val() || 0;
  logger.info('bandwidth-charged', { uid, writtenBytes, totalToday, limit: DAILY_BYTE_LIMIT });

  if (totalToday <= DAILY_BYTE_LIMIT) return;

  const blockedRef = db.ref(`sync/${ns}/users/${uid}/blocked`);
  const wasAlreadyBlocked = (await blockedRef.get()).val() === true;
  if (wasAlreadyBlocked) return;

  await blockedRef.set(true);
  logger.error('sync-quota-exceeded', {
    uid,
    ns,
    totalBytesToday: totalToday,
    limit: DAILY_BYTE_LIMIT
  });
}

// Themes are the second thing a client may write, so they are metered too.
//
// This one triggers directly on the node rather than on a small companion the
// way enforceSyncQuota does, and that is safe here for the reason it was not
// there: a theme is a name and a few dozen colour strings, capped field by
// field in database.rules.json, so it cannot approach the payload ceiling that
// a full note blew past.
exports.meterThemeWrite = onValueWritten(
  {
    ref: 'sync/{ns}/users/{uid}/themes/{themeId}',
    region: 'us-central1',
    maxInstances: MAX_INSTANCES
  },
  async event => {
    const { ns, uid } = event.params;
    if (!event.data.after.exists()) return; // deleted, nothing to charge

    recordActivity(uid).catch(error =>
      logger.warn('activity-stamp-failed', { uid, message: error.message })
    );

    await chargeBandwidth(getDatabase(), ns, uid, byteSizeOf(event.data.after.val()));
  }
);

// Daily counters are naturally scoped by date key, so nothing needs to
// actively "reset" usage - a new day just starts a fresh counter. But the
// quota function only ever sets `blocked`, never clears it, so this sweeps
// stale blocks once a day.
exports.resetDailyBlocks = onSchedule(
  {
    schedule: 'every day 00:05',
    region: 'us-central1',
    maxInstances: SCHEDULED_MAX_INSTANCES
  },
  async () => {
    const db = getDatabase();
    const usersSnap = await db.ref(`sync/${SYNC_NAMESPACE}/users`).get();
    if (!usersSnap.exists()) return;

    const updates = {};
    usersSnap.forEach(userSnap => {
      if (userSnap.child('blocked').val() === true) {
        updates[`sync/${SYNC_NAMESPACE}/users/${userSnap.key}/blocked`] = null;
      }
    });

    const unblockedCount = Object.keys(updates).length;
    if (unblockedCount === 0) return;

    await db.ref().update(updates);
    logger.info('sync-quota-reset', { unblockedCount });
  }
);

// --- Stored bytes ------------------------------------------------------
//
// enforceSyncQuota above counts what a note weighs in the database, which
// stopped being most of the data the day attachments moved to Cloud Storage: a
// 40 MB upload writes a few hundred bytes of ref into RTDB and the rest is
// invisible to a database trigger. These keep a running balance per account
// instead — up on upload, down on delete, never reset, which is why it lives
// in its own node and resetDailyBlocks must not touch it.
//
// An overwrite fires both triggers: the replaced generation is deleted and the
// new one finalized, so the arithmetic balances without special-casing.
//
// The work itself is in storageAccounting.js, so it can be tested without a
// functions runtime. Everything here is wiring.

exports.trackStorageUpload = onObjectFinalized(
  { region: 'us-central1', maxInstances: MAX_INSTANCES },
  async event => {
    await recordStorageDelta(event.data.name, Number(event.data.size) || 0);
  }
);

exports.trackStorageDelete = onObjectDeleted(
  { region: 'us-central1', maxInstances: MAX_INSTANCES },
  async event => {
    await recordStorageDelta(event.data.name, -(Number(event.data.size) || 0));
  }
);

// Weekly rather than nightly: a full bucket listing is the most expensive
// thing here, drift accumulates slowly, and every upload and delete in between
// is already keeping the balance current on its own.
//
// To run it now — the initial backfill, or after suspecting drift — use Force
// run on its Cloud Scheduler job in the Google Cloud console. It is safe to
// run at any time and safe to run twice; it computes an absolute total rather
// than applying a change.
exports.reconcileStorageUsage = onSchedule(
  {
    schedule: 'every sunday 03:00',
    region: 'us-central1',
    maxInstances: SCHEDULED_MAX_INSTANCES,
    timeoutSeconds: 540,
    memory: '512MiB'
  },
  async () => {
    await reconcileStorageUsage();
  }
);

// One row a day of how many accounts there are, how many came back, and what
// they are keeping. Runs late enough that the day it summarises is over in
// UTC, and after resetDailyBlocks so a swept block is not counted as a live
// one.
//
// The numbers are cheap to recompute; the history is not. Nothing can
// reconstruct what a month looked like after the fact, which is why this is
// worth running from the day there is nothing to see.
exports.rollUpStats = onSchedule(
  {
    schedule: 'every day 00:15',
    region: 'us-central1',
    maxInstances: SCHEDULED_MAX_INSTANCES
  },
  async () => {
    await rollUpStats();
  }
);

// DISABLED 2026-08-08: same TRIGGER_PAYLOAD_TOO_LARGE issue as enforceSyncQuota
// above (also watched files/{fileId}). See that comment for details. If
// revived, avoid triggering directly on files/{fileId}.
//
// exports.normalizeSyncedFileSchema = onValueWritten(
//   { ref: 'sync/{ns}/users/{uid}/files/{fileId}', region: 'us-central1' },
//   async event => {
//     if (!event.data.after.exists()) return; // deleted
//
//     const after = event.data.after.val();
//     const currentVersion = Number(after.schemaVersion || 0);
//     if (currentVersion >= LATEST_SCHEMA_VERSION) return;
//
//     const migrated = migrateFilePayload(after, currentVersion);
//     await event.data.after.ref.set({ ...migrated, schemaVersion: LATEST_SCHEMA_VERSION });
//   }
// );

// Bandwidth monitoring. Kept in its own folder with its own config, its own
// mailer and its own thresholds: it only reads what the quota guard above
// writes, so leaving it out disables every alert without touching enforcement.
//
// Production only. These exist to mail a real person about real traffic, and
// they declare the SMTP secret to do it — which means a project without that
// secret cannot deploy *anything* while they are declared, because the CLI
// resolves every secret in the codebase before working out which functions you
// actually asked for. Staging has no reason to want alerts and no business
// holding the credential.
//
// Keyed on the project rather than on a variable, because a variable does not
// survive the trip. The CLI analyses this file in a subprocess it gives a
// curated environment: anything exported in the shell is dropped, and the
// project's own .env file is loaded *after* the analysis has already run. Both
// were tried. GCLOUD_PROJECT is the one thing reliably set by then.
const PRODUCTION_PROJECT_ID = 'arial-473c1';

if (process.env.GCLOUD_PROJECT === PRODUCTION_PROJECT_ID) {
  const monitoring = require('./monitoring');
  exports.bandwidthWatch = monitoring.bandwidthWatch;
  exports.projectBandwidthWatch = monitoring.projectBandwidthWatch;
  exports.bandwidthDigest = monitoring.bandwidthDigest;
  exports.sendMonitoringTestMail = monitoring.sendMonitoringTestMail;
}

// Keeps sync/{ns}/meta/schemaVersion in sync with the constants above so
// clients (checkSyncCompatibility in firebaseClient.js) always read a
// current value, even if that node is ever manually cleared.
exports.publishSchemaVersionMeta = onSchedule(
  {
    schedule: 'every day 00:00',
    region: 'us-central1',
    maxInstances: SCHEDULED_MAX_INSTANCES
  },
  async () => {
    const db = getDatabase();
    await db.ref(`sync/${SYNC_NAMESPACE}/meta/schemaVersion`).set({
      latest: LATEST_SCHEMA_VERSION,
      minSupported: MIN_SUPPORTED_SCHEMA_VERSION
    });
  }
);

// --- The paywall -------------------------------------------------------
//
// Polar is the merchant of record, so what arrives here is a notification that
// money moved, not a payment to take. Everything this decides is decided
// elsewhere and tested without a runtime: polarAdapter.js reads Polar,
// entitlements.js says what someone is owed, subscriptionRecord.js says what
// to write down, subscriptions.js writes it. What is below is the door.
//
// Three things a payment endpoint has to get right, all of them here:
//
//   - **Verify before parsing.** The signature is over the bytes as received,
//     so req.rawBody is the only acceptable input; JSON.parse's output
//     re-serialised is a different string and would never match.
//   - **Answer 2xx for anything a retry cannot fix.** A delivery we do not
//     care about, or one we cannot attribute, is not a failure — returning 500
//     to it buys an hour of retries and an alert mail about a webhook that is
//     working exactly as intended.
//   - **Answer non-2xx when we genuinely failed**, so it *is* retried. A
//     database that was briefly unreachable must not swallow somebody's
//     upgrade.
const polarWebhookSecret = defineSecret('POLAR_WEBHOOK_SECRET');

// Used only to end a subscription after a full refund — see revokeAfterRefund.
// It needs the `subscriptions:write` scope and nothing else; a token that can
// do more than the one job it is here for is a token whose blast radius is
// somebody else's decision. Sandbox and production have separate tokens, and
// which Polar is reached is keyed on the Firebase project rather than on a
// setting, so a staging deploy cannot revoke a real customer's subscription.
const polarAccessToken = defineSecret('POLAR_ACCESS_TOKEN');

exports.polarWebhook = onRequest(
  {
    region: 'us-central1',
    maxInstances: MAX_INSTANCES,
    secrets: [polarWebhookSecret, polarAccessToken],
    cors: false
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('POST only');
      return;
    }

    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';
    const verdict = verifyWebhook({
      secret: polarWebhookSecret.value(),
      headers: req.headers,
      rawBody
    });

    if (!verdict.ok) {
      // 401 and nothing else. Saying which part was wrong tells whoever is
      // probing whether they have the right secret, the right window or the
      // right body, one guess at a time.
      logger.warn('polar-webhook-rejected', { reason: verdict.reason });
      res.status(401).send('unauthorized');
      return;
    }

    let event;
    try {
      event = JSON.parse(rawBody);
    } catch (error) {
      logger.error('polar-webhook-unparseable', { id: verdict.id });
      res.status(400).send('bad json');
      return;
    }

    try {
      const outcome = await applyPolarEvent({
        event,
        eventId: verdict.id,
        eventAt: eventAtFrom(event, Date.now()),
        polar: {
          token: polarAccessToken.value(),
          baseUrl: apiBaseFor(runningProject(), PRODUCTION_PROJECT_ID)
        }
      });
      res.status(200).json(outcome);
    } catch (error) {
      // The one case that must be retried: we understood it and failed to
      // carry it out.
      // `message` is the logger's own field -- passing one in the payload
      // overwrites the line with the stack of the log call itself, which is
      // how the first failure here arrived with no cause attached.
      logger.error('polar-webhook-failed', { id: verdict.id, cause: error.message, stack: error.stack });
      res.status(500).send('retry');
    }
  }
);

// The pass that looks again — see the reconcile rule in CLAUDE.md, and the
// long comment on sweepExpiredPlans.
//
// Daily rather than weekly, unlike the storage reconcile: what this corrects
// is an account sitting on a plan it is no longer paying for, and a week of
// that is a week of storage given away. It is also far cheaper — one read of a
// node with a row per subscriber, against a full listing of the bucket.
exports.sweepExpiredPlans = onSchedule(
  {
    schedule: 'every day 04:00',
    region: 'us-central1',
    maxInstances: SCHEDULED_MAX_INSTANCES
  },
  async () => {
    await sweepExpiredPlans({});
  }
);
