// Turning what Polar sends into what entitlements.js already understands.
//
// Everything provider-specific lives here and nothing else knows Polar exists,
// so swapping to Paddle later means writing a second file this size rather
// than unpicking the paywall. The decisions about what a person is owed are in
// entitlements.js and are not repeated.
//
// Two jobs: prove the request really came from Polar, and reduce its vocabulary
// to one of our statuses.

const crypto = require('node:crypto');
const { STATUS } = require('./entitlements');

// Polar signs with the Standard Webhooks spec: an id, a timestamp and the raw
// body, joined with dots and HMAC-SHA256'd under the endpoint secret.
// https://www.standardwebhooks.com/
const SIGNED_HEADERS = {
  id: 'webhook-id',
  timestamp: 'webhook-timestamp',
  signature: 'webhook-signature'
};

// Five minutes. A signature stays valid for ever on its own — it is a hash of
// a body that does not change — so without a window an attacker who captures
// one legitimate delivery can replay it whenever they like, and "subscription
// active" replayed after a refund is a free account.
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

// Standard Webhooks secrets are base64 behind a `whsec_` prefix. Signing over
// the printable string instead of the decoded bytes produces a signature that
// is wrong in a way nothing catches until every real delivery is rejected.
function decodeSecret(secret) {
  const raw = String(secret || '').replace(/^whsec_/, '');
  return Buffer.from(raw, 'base64');
}

function expectedSignature(secret, id, timestamp, rawBody) {
  return crypto
    .createHmac('sha256', decodeSecret(secret))
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');
}

// Constant-time, and length-checked first because timingSafeEqual throws on a
// length mismatch rather than returning false. A plain === here leaks how much
// of a guess was right, one byte at a time.
function signaturesMatch(sent, expected) {
  const a = Buffer.from(sent, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Whether a delivery genuinely came from Polar, unmodified and recent.
 *
 * `rawBody` must be the bytes as received. Re-serialising the parsed JSON
 * changes key order and whitespace, and the signature is over the original —
 * which is why the endpoint has to reach for req.rawBody rather than req.body.
 */
function verifyWebhook({ secret, headers = {}, rawBody = '', now = Date.now() }) {
  if (!secret) return { ok: false, reason: 'no-secret' };

  const id = headers[SIGNED_HEADERS.id];
  const timestamp = headers[SIGNED_HEADERS.timestamp];
  const signatureHeader = headers[SIGNED_HEADERS.signature];

  if (!id || !timestamp || !signatureHeader) return { ok: false, reason: 'missing-headers' };

  const sentAt = Number(timestamp) * 1000;
  if (!Number.isFinite(sentAt)) return { ok: false, reason: 'bad-timestamp' };
  if (Math.abs(now - sentAt) > TIMESTAMP_TOLERANCE_MS) return { ok: false, reason: 'stale' };

  const expected = expectedSignature(secret, id, timestamp, rawBody);

  // The header carries one or more space-separated `v1,<signature>` entries,
  // because a secret being rotated means both the old and the new one are
  // valid for a while. Any match is a match.
  const offered = String(signatureHeader)
    .split(' ')
    .map(part => part.split(',')[1] || '')
    .filter(Boolean);

  const ok = offered.some(candidate => signaturesMatch(candidate, expected));
  return ok ? { ok: true, id } : { ok: false, reason: 'bad-signature' };
}

// Polar's own subscription states, reduced to the five that change what
// someone is owed. Read from the payload rather than inferred from the event
// name: `subscription.updated` is a catch-all that fires for cancels, renewals,
// pauses and resumptions alike, so the name says a subscription changed and
// only the status says how.
function statusFromSubscription(data = {}) {
  switch (data.status) {
    // A trial is access. Someone inside one is owed the product.
    case 'active':
    case 'trialing':
      // Cancelled-at-period-end still reports active, because it is: they keep
      // it until the period runs out. Treating it as active would be right
      // today and wrong the moment the period ends, and nothing would fire to
      // correct it — subscription.revoked does that, but only if we recorded
      // the end date now.
      return data.cancel_at_period_end ? STATUS.CANCELED : STATUS.ACTIVE;

    case 'past_due':
      return STATUS.PAST_DUE;

    case 'canceled':
      return STATUS.CANCELED;

    // Dunning gave up, or the subscription never got off the ground.
    case 'unpaid':
    case 'incomplete':
    case 'incomplete_expired':
      return STATUS.NONE;

    default:
      return null;
  }
}

/** What an event means for entitlement, or null if it means nothing. */
function statusFromEvent(event = {}) {
  const type = event.type;
  const data = event.data || {};

  // Money returned, immediately and regardless of what the subscription says.
  if (type === 'order.refunded') return STATUS.REFUNDED;

  // Benefits permanently gone: the end of a cancelled period, or an immediate
  // revocation.
  if (type === 'subscription.revoked') return STATUS.NONE;

  if (typeof type === 'string' && type.startsWith('subscription.')) {
    return statusFromSubscription(data);
  }

  // Checkouts, benefit grants, everything else. Not an entitlement change, and
  // silence is the correct answer rather than a guess.
  return null;
}

/**
 * The Firebase account a payment belongs to.
 *
 * Carried as checkout metadata rather than matched on email, because the
 * address someone types at a checkout is very often not the one on their
 * Google account — and matching on it would hand one person's subscription to
 * somebody else. Metadata follows the checkout onto the subscription and its
 * orders, so it is read from several places depending on which event arrived.
 */
// The keys a uid might arrive under, in the order they are trusted.
//
// `uid` is what a checkout created through the API carries, because we set it.
// The other two are Polar's doing: a checkout *link* cannot take arbitrary
// metadata in its URL — only `reference_id` and the utm parameters, which
// Polar says it attaches to the session's metadata. Which spelling it uses
// there is not documented, so both are read rather than guessed at.
const UID_KEYS = ['uid', 'reference_id', 'referenceId'];

// A uid becomes part of a database path, so its shape is checked before it is
// used as one. `sync/{ns}/users/{uid}/plan` with a slash or a dot in `uid`
// does not fail — it writes somewhere else entirely, which is the sort of bug
// that only shows up as somebody else's account changing.
//
// What is checked is the characters, not the length. A Firebase uid is 28 of
// [A-Za-z0-9], but a minimum here would be a guess at somebody else's format
// that quietly refuses to take payments the day an id looks different — while
// buying nothing, because it is `/`, `.`, `#`, `$`, `[` and `]` that move
// around a path and all of them are already gone.
function looksLikeUid(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function uidFromEvent(event = {}) {
  const data = event.data || {};

  // Depending on which event arrived, the metadata hangs off a different
  // object: an order carries its subscription, a subscription carries its
  // customer, and the checkout carries what started all of it.
  const holders = [data, data.subscription, data.checkout, data.customer];

  for (const holder of holders) {
    if (!holder) continue;

    // An external customer id is the cleanest of the lot when it is there:
    // Polar keeps it on the Customer, so every later event carries it without
    // metadata having to propagate anywhere.
    if (looksLikeUid(holder.external_id)) return holder.external_id;
    if (holder.customer && looksLikeUid(holder.customer.external_id)) {
      return holder.customer.external_id;
    }

    const metadata = holder.metadata;
    if (!metadata) continue;
    for (const key of UID_KEYS) {
      if (looksLikeUid(metadata[key])) return metadata[key];
    }
  }

  return null;
}

/**
 * What an unmatched delivery looked like, for working out where the uid went.
 *
 * Only shapes: the event's type and the key *names* it carried, never their
 * values. The values are a stranger's email address, name and billing country,
 * and none of that belongs in our database because a checkout failed to carry
 * an id.
 */
function eventShape(event = {}) {
  const data = event.data || {};
  const shapeOf = value =>
    value && typeof value === 'object' ? Object.keys(value).sort() : null;

  return {
    type: typeof event.type === 'string' ? event.type : null,
    dataKeys: shapeOf(data) || [],
    metadataKeys: shapeOf(data.metadata) || [],
    subscriptionMetadataKeys: shapeOf(data.subscription && data.subscription.metadata) || [],
    checkoutMetadataKeys: shapeOf(data.checkout && data.checkout.metadata) || [],
    customerMetadataKeys: shapeOf(data.customer && data.customer.metadata) || [],
    hasCustomerExternalId: Boolean(data.customer && data.customer.external_id)
  };
}

/**
 * The subscription an event is about, when it names one.
 *
 * An order carries the subscription it paid for, which is what makes it
 * possible to act on the subscription from a refund.
 */
function subscriptionIdFrom(event = {}) {
  const data = event.data || {};
  const candidates = [data.subscription_id, data.subscription && data.subscription.id];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  }
  return null;
}

/**
 * Whether a refund took back the whole order, or only part of it.
 *
 * `order.refunded` fires for both -- Polar says so in as many words -- and the
 * difference matters enormously, because the only reason to read this is to
 * decide whether to end somebody's subscription. A goodwill refund of one
 * month on a subscription that is carrying on must not cancel it.
 *
 * Returns `null` when it cannot be told, and the caller must then do nothing.
 * The field names here are not in the published docs, so this reads the two
 * that a real payload plausibly carries and refuses to guess past them. Failing
 * to revoke leaves a subscription somebody has to end by hand; revoking by
 * mistake cuts off a paying customer. Only one of those is recoverable in a
 * click, which is the whole reason the uncertain case does nothing.
 */
function refundIsFull(event = {}) {
  const data = event.data || {};

  if (data.status === 'partially_refunded') return false;
  if (data.status === 'refunded') return true;

  const refunded = Number(data.refunded_amount);
  const total = Number(data.total_amount ?? data.amount);
  if (Number.isFinite(refunded) && Number.isFinite(total) && total > 0) {
    return refunded >= total;
  }

  return null;
}

/**
 * When the event itself happened, as a timestamp.
 *
 * Not the delivery time. A retry is re-signed with the clock at the moment it
 * is retried — that is what lets a signature stay inside a five-minute window
 * on the fourth attempt an hour later — so the header says when it was *sent*,
 * which for an event that failed twice is long after it happened. Ordering by
 * that would let an old event that took three attempts land on top of a newer
 * one that landed first time.
 *
 * The object's own `modified_at` is what actually changed and when.
 */
function eventAtFrom(event = {}, deliveredAt = 0) {
  const data = event.data || {};
  const raw = data.modified_at || data.created_at || null;
  const parsed = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : Number(deliveredAt) || 0;
}

/** When the paid-for period runs out, as a timestamp. */
function periodEndsAt(event = {}) {
  const data = event.data || {};
  const subscription = data.subscription || {};

  // `ends_at` first, and it is the whole point of this function reading two
  // fields instead of one.
  //
  // A revoked subscription comes back with `status: "canceled"` and a
  // `current_period_end` still a month away, because the period it was paid
  // for has not run out -- access was taken away inside it. Reading only the
  // period end therefore says "cancelled, keeps it until October", which is
  // how a revoke put an account back on the paid plan for twenty seconds on
  // 2026-09-26, until the `subscription.revoked` event happened to arrive and
  // correct it. Had that one delivery gone missing, the account would have
  // kept the plan for a month and nothing would ever have looked again --
  // `expiredPlanFor` recomputes from the record, and the record would have
  // said the same wrong thing.
  //
  // `ends_at` is when access ends in both cases: the period end for a
  // cancel-at-period-end, and the moment of the revoke for a revoke. On a
  // healthy subscription it is null and the period end is right.
  const raw =
    data.ends_at
    || subscription.ends_at
    || data.current_period_end
    || subscription.current_period_end
    || null;

  if (!raw) return 0;

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

module.exports = {
  SIGNED_HEADERS,
  TIMESTAMP_TOLERANCE_MS,
  expectedSignature,
  verifyWebhook,
  statusFromSubscription,
  statusFromEvent,
  looksLikeUid,
  uidFromEvent,
  eventShape,
  subscriptionIdFrom,
  refundIsFull,
  eventAtFrom,
  periodEndsAt
};
