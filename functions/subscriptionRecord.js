// What an account's subscription record should say after a webhook arrives.
//
// The two files either side of this one already exist: polarAdapter.js turns
// Polar's vocabulary into a status, and entitlements.js turns a status into a
// plan. What was missing is the bit in the middle — given what we already had
// written down and what just arrived, what should be written down now.
//
// It is here, and not in the endpoint, for the reason in CLAUDE.md: the
// endpoint needs a signed request and a running functions runtime to answer a
// question, and all of the interesting cases are the ones nobody will ever
// send by hand. A refund arriving before the renewal it refunds. The same
// delivery twice. A card failing three times in an hour.
//
// Everything here computes an **absolute** record rather than a change to one,
// which is what makes running it twice harmless.

const {
  STATUS,
  resolvePlan,
  graceEndsAt,
  isAlreadyProcessed
} = require('./entitlements');
const { statusFromEvent, periodEndsAt } = require('./polarAdapter');

// How many delivery ids to keep. They exist only to recognise a redelivery,
// and a provider gives up retrying long before twenty more events have
// happened to one subscription — while an unbounded map is a node that grows
// for ever on the busiest accounts.
const SEEN_EVENTS_KEPT = 20;

// Why a delivery changed nothing. Returned rather than thrown, because none of
// these are errors: most deliveries genuinely mean nothing to us, and an
// endpoint that treats "nothing to do" as a failure gets retried for ever.
const IGNORED = {
  DUPLICATE: 'duplicate',
  OUT_OF_ORDER: 'out-of-order',
  NOT_AN_ENTITLEMENT: 'not-an-entitlement',
  UNKNOWN_STATUS: 'unknown-status'
};

// Characters a Realtime Database key cannot hold, and the escape for them.
//
// The delivery id is somebody else's string and it becomes a key here. RTDB
// refuses `.`, `#`, `$`, `[`, `]` and `/` in a key, and refuses them by
// throwing — so one id in an unexpected format does not degrade anything, it
// makes the whole write fail, which makes the endpoint answer 500, which makes
// the provider retry it for ever while nobody's plan ever changes.
//
// Escaped rather than stripped, and `%` escaped first, so that two different
// ids cannot collapse into the same key. Two events sharing a key would mean
// the second one is mistaken for a redelivery of the first and silently
// dropped, which on a refund following a renewal is money.
const ILLEGAL_IN_KEY = /[%.#$[\]/]/g;

function eventKey(eventId) {
  const raw = String(eventId == null ? '' : eventId);
  if (raw === '') return '';
  return raw.replace(ILLEGAL_IN_KEY, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/** The seen-event map with this id added, oldest dropped once it is full. */
function rememberEvent(seen = {}, eventId, at) {
  const next = { ...seen, [eventId]: at };
  const ids = Object.keys(next);
  if (ids.length <= SEEN_EVENTS_KEPT) return next;

  ids
    .sort((a, b) => (Number(next[a]) || 0) - (Number(next[b]) || 0))
    .slice(0, ids.length - SEEN_EVENTS_KEPT)
    .forEach(id => delete next[id]);

  return next;
}

/**
 * When the grace period for a failed payment should end.
 *
 * Not restarted while one is already running. A card that is declined is
 * declined again on every retry the provider makes, and each of those is a
 * `past_due` delivery — so extending the window on each one would keep pushing
 * the deadline out and the account would never actually lapse.
 */
function graceFor(record, now) {
  const running = Number(record.gracePeriodEndsAt) || 0;
  if (record.status === STATUS.PAST_DUE && running > now) return running;
  return graceEndsAt(now);
}

/**
 * The record to store after this delivery, or why there is nothing to store.
 *
 * `eventAt` is when the provider says the event happened, not when it arrived.
 * Deliveries overtake each other — a retry of an older event is sent again
 * after a newer one has already landed — and applying them in arrival order
 * would let a replayed `subscription.active` undo a revocation. An event older
 * than the one already recorded is dropped.
 */
function recordAfterEvent({
  event = {},
  record = {},
  eventId = '',
  eventAt = 0,
  now = Date.now()
} = {}) {
  const key = eventKey(eventId);

  if (isAlreadyProcessed(record.seenEvents, key)) {
    return { ignored: IGNORED.DUPLICATE, record: null, plan: null };
  }

  const at = Number(eventAt) || 0;
  const lastAt = Number(record.eventAt) || 0;
  if (at > 0 && lastAt > 0 && at < lastAt) {
    return { ignored: IGNORED.OUT_OF_ORDER, record: null, plan: null };
  }

  const status = statusFromEvent(event);
  if (!status) {
    return { ignored: IGNORED.NOT_AN_ENTITLEMENT, record: null, plan: null };
  }

  // A period end the event does not mention is the one we already knew. An
  // order event carries no period of its own, and taking its silence for zero
  // would end a cancelled subscription's paid-up time the moment it renewed.
  const endsAt = periodEndsAt(event) || Number(record.periodEndsAt) || 0;
  const gracePeriodEndsAt = status === STATUS.PAST_DUE ? graceFor(record, now) : 0;
  const basePlan = record.basePlan;

  const plan = resolvePlan({ status, basePlan, periodEndsAt: endsAt, gracePeriodEndsAt, now });
  if (plan === null) {
    return { ignored: IGNORED.UNKNOWN_STATUS, record: null, plan: null };
  }

  return {
    ignored: null,
    plan,
    record: {
      ...record,
      plan,
      status,
      periodEndsAt: endsAt,
      gracePeriodEndsAt,
      provider: 'polar',
      eventAt: at || lastAt,
      lastEventType: typeof event.type === 'string' ? event.type : null,
      updatedAt: now,
      seenEvents: rememberEvent(record.seenEvents, key, at || now)
    }
  };
}

module.exports = {
  SEEN_EVENTS_KEPT,
  eventKey,
  IGNORED,
  rememberEvent,
  graceFor,
  recordAfterEvent
};
