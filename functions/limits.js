// Single source of truth for the sync usage ceilings.
//
// Lives in its own file because several independent things need the same
// numbers and none should have to require the others: the quota guard in
// index.js (which enforces them), the bandwidth monitor in monitoring/ (which
// warns before you get there), and the tests. Change them here and all of them
// follow.

// --- Bandwidth ---------------------------------------------------------
//
// A cost guard, not a product. It caps how much a single account can write in
// a day so a runaway client or a script cannot run up the bill; it is not what
// anyone is sold, and it is deliberately far above normal use.
//
// 50 MB since 2026-11-11, from 250. Measured from `usage/` that day: since the
// sync fixes of late September an account writes 0.64 MB on a typical day and
// 2.6 MB on a busy one (90th percentile); one day in fifty went past 25 MB --
// 69 MB, most likely a first sync or an import, which is exactly what a new
// account does on its first day. So 50 MB: twenty times a busy day, with room
// for that day. Sora asked for 25 MB; 50 was agreed for the import.
const DAILY_BYTE_LIMIT = 50 * 1024 * 1024; // per user, per UTC day

// --- Stored bytes ------------------------------------------------------
//
// This one *is* the product. It is what a person understands ("5 GB"), what a
// price is attached to, and what actually costs money to keep, because
// attachments live in Cloud Storage for as long as the note does. Bandwidth
// above is charged per day and forgotten; this accumulates.
//
// Free is set where a text note-taker will never reach it and someone using
// image and music blocks in earnest will, within weeks — those are the two
// groups, and only the second one costs anything to serve.
const STORAGE_BYTE_LIMITS = {
  free: 100 * 1024 * 1024, //   100 MB — the default, and what a price attaches to
  pro: 10 * 1024 * 1024 * 1024, //   10 GB — the paid tier
  legacy: 5 * 1024 * 1024 * 1024, //    5 GB — grandfathered
  owner: Number.POSITIVE_INFINITY, // no ceiling
  tiny: 1 * 1024 * 1024 //     1 MB — for testing the ceiling
};

// `legacy` exists because a limit introduced after people are already using
// something is a limit taken away from them. Accounts that predate the free
// tier keep room to spare rather than waking up over a line that did not exist
// when they filled it; new accounts get `free`. It is assigned per account, as
// data, so who is on it can be read rather than inferred.
//
// `owner` is the project's own account. Deliberately a plan and not a rule
// about the shape of a uid: matching a prefix would hand unlimited storage to
// whichever stranger's account happened to start with the same two characters,
// and "who pays nothing" is not a question to answer with a substring.
//
// `tiny` exists so the far side of the ceiling can be reached on purpose. The
// interesting behaviour — the account flipping to full, the claim landing on
// the token, uploads being refused, and all of it unwinding again when
// something is deleted — only happens past the limit, and proving it at 100 MB
// means uploading 100 MB every time anyone wants to check. Put a staging
// account on `tiny` and one photo is enough.
//
// It is safe in production for the same reason every other plan is: nothing
// assigns it. A plan is written by the server, per account, and only ever the
// one somebody chose.

const DEFAULT_PLAN = 'free';

// An account with no plan recorded is free, and so is one carrying a plan name
// this build has never heard of. Both directions matter: the field does not
// exist yet on any account, and when it does, a rolled-back deploy must not
// silently promote everyone by failing open.
function storageLimitFor(plan) {
  return STORAGE_BYTE_LIMITS[plan] ?? STORAGE_BYTE_LIMITS[DEFAULT_PLAN];
}

function isOverStorageLimit(bytes, plan) {
  return Number(bytes || 0) > storageLimitFor(plan);
}

// Infinity is not JSON and the database will not hold it, so an unlimited plan
// records a null limit — which the app can read as "no ceiling". Writing some
// enormous number instead would store a lie that looks like a real limit to
// whoever reads it next.
function storableLimit(limit) {
  return Number.isFinite(limit) ? limit : null;
}

module.exports = {
  DAILY_BYTE_LIMIT,
  STORAGE_BYTE_LIMITS,
  DEFAULT_PLAN,
  storageLimitFor,
  isOverStorageLimit,
  storableLimit
};
