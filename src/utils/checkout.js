/**
 * Sending somebody to a checkout, and knowing whether to offer one.
 *
 * ## The uid has to survive the round trip
 *
 * Polar never learns who an account is on its own. The payment comes back as a
 * webhook carrying an email address, and the address someone types at a
 * checkout is very often not the one on their Google account — so matching on
 * it would eventually hand one person's subscription to somebody else. The
 * Firebase uid has to travel *with* the checkout.
 *
 * A checkout link cannot carry arbitrary metadata in its URL. What it does
 * take is `reference_id`, which Polar attaches to the checkout session's
 * metadata, and that is what is used here. The webhook end reads several
 * spellings of it, because which one it lands under is not documented, and
 * records the shape of anything it cannot attribute so that one real checkout
 * settles it. See `functions/polarAdapter.js`.
 *
 * ## Nothing is offered until there is something to sell
 *
 * `POLAR_CHECKOUT_LINK` is empty until a product exists in Polar. Everything
 * here returns "do not show" while it is, so a half-finished paywall shows a
 * button that goes nowhere to nobody.
 */

/**
 * The checkout link from the Polar dashboard — Products → the product →
 * Checkout Links.
 *
 * Use the **sandbox** link while testing (sandbox.polar.sh issues its own,
 * against test cards) and swap it for the live one when the sandbox run has
 * passed. Not a secret: it is a public URL that anyone can open, and it
 * carries no authority of its own.
 */
export const POLAR_CHECKOUT_LINK = '';

/** Plans that are already paying, or already unlimited. Nothing to sell them. */
const PAID_PLANS = ['pro', 'owner'];

/** The query parameter Polar puts into the checkout session's metadata. */
const REFERENCE_PARAM = 'reference_id';

/**
 * The checkout URL for this account, or null when there is nothing to open.
 *
 * Null rather than a bare link when the uid is missing: a checkout that does
 * not carry one takes the money and leaves nothing able to work out whose
 * account to upgrade, which is worse than no button at all.
 */
export function checkoutUrlFor({ link = POLAR_CHECKOUT_LINK, uid } = {}) {
  if (typeof link !== 'string' || link.trim() === '') return null;
  if (typeof uid !== 'string' || uid.trim() === '') return null;

  try {
    const url = new URL(link.trim());
    // Only ever https. A checkout opened over http is a payment page an
    // intermediary can rewrite.
    if (url.protocol !== 'https:') return null;
    url.searchParams.set(REFERENCE_PARAM, uid.trim());
    return url.toString();
  } catch {
    return null;
  }
}

/** Whether an account is already on something paid. */
export function isPaidPlan(plan) {
  return PAID_PLANS.includes(String(plan || ''));
}

/**
 * Whether to offer an upgrade, and how loudly.
 *
 * The plan is read from the storage record the server writes rather than
 * guessed from the size of the limit — see the comment where it is written in
 * `functions/storageAccounting.js`. An account with no plan recorded is on the
 * free one, which is the same answer the server gives.
 *
 * `tone` is the difference between a line in a settings panel and an
 * explanation of why an upload just failed. Both are the same button.
 */
export function upgradeOffer({ usage, uid, link = POLAR_CHECKOUT_LINK } = {}) {
  const url = checkoutUrlFor({ link, uid });
  if (!url) return { show: false, url: null, tone: 'quiet' };

  const record = usage || {};
  if (isPaidPlan(record.plan)) return { show: false, url: null, tone: 'quiet' };

  // An unlimited account has no ceiling to sell, whatever its plan is called.
  if (record.limit === null || record.limit === undefined) {
    return { show: false, url: null, tone: 'quiet' };
  }

  const full = record.full === true;
  return { show: true, url, tone: full ? 'urgent' : 'quiet' };
}
