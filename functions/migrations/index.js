// Schema-version plumbing for synced file payloads (sync/{ns}/users/{uid}/files/{fileId}).
//
// LATEST_SCHEMA_VERSION must match SYNC_SCHEMA_VERSION in src/firebaseClient.js.
// When a client-side change makes an old payload shape unreadable by newer
// instances, bump LATEST_SCHEMA_VERSION and add a step here, e.g.:
//
//   const v1ToV2 = require('./v1-to-v2');
//   const MIGRATIONS = { 1: v1ToV2 };
//
// Each step takes the payload written under version N and returns the
// equivalent payload for version N + 1. Steps run in sequence so a payload
// several versions behind gets migrated all the way forward in one write.

// 2 (0.8.67): nothing to migrate -- the payload's shape is the same -- but
// builds before 0.8.662 drop what they do not know when they save, so they are
// no longer supported and the database rules refuse their writes. See
// SYNC_SCHEMA_VERSION in src/firebaseClient.js.
const LATEST_SCHEMA_VERSION = 2;
const MIN_SUPPORTED_SCHEMA_VERSION = 2;

const MIGRATIONS = {};

function migrateFilePayload(payload, fromVersion) {
  let current = payload;
  let version = Number(fromVersion) || 0;

  while (version < LATEST_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) break; // no migration registered for this gap yet; leave shape as-is
    current = step(current);
    version += 1;
  }

  return current;
}

module.exports = { LATEST_SCHEMA_VERSION, MIN_SUPPORTED_SCHEMA_VERSION, migrateFilePayload };
