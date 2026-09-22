/**
 * What the person paying is actually told.
 *
 * ## Why this exists
 *
 * The paywall was built from the money inwards: a webhook, an entitlement, a
 * ceiling that moves. All of that is invisible. What a subscriber could see in
 * the app was a single Upgrade button — not what plan they were on, not what
 * they would get for paying, not when it renews, not that their card had
 * failed, and no way at all to leave.
 *
 * "Right now I see that of all the things customers should have, there's not
 * even half of it done" — 2026-09-22. Correct, and this is the other half.
 *
 * ## Four states, and three of them are the ones that matter
 *
 * Paying and fine is the easy one. The three that decide whether somebody
 * feels cheated are:
 *
 * - **Cancelled but still paid up.** They must see that they keep it until the
 *   date, or they will think they lost what they bought.
 * - **A card that failed.** They must be told, with the deadline, while there
 *   is still time to fix it. A plan that vanishes without warning reads as
 *   theft, and the customer is usually not even aware their card expired.
 * - **Grandfathered.** Never sold something they already have more of.
 *
 * Pure, so every one of those can be exercised without a browser, an account
 * or a payment.
 */

/** Plans that are paying or unlimited, and so have nothing to be sold. */
const SETTLED_PLANS = ['pro', 'owner'];

/** What each plan is called where a person can see it. */
const PLAN_LABELS = {
  free: 'Free',
  pro: 'Pro',
  legacy: 'Legacy',
  owner: 'Owner'
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * A date as a person reads it.
 *
 * Built by hand rather than with `Intl`, so that what the tests assert is what
 * everybody sees. A locale-dependent string would pass here and read
 * differently on the machine it matters on.
 *
 * Local parts, never UTC — the same reason `habitDays.js` builds its keys that
 * way. "Renews on 21 October" must not say the 22nd because it is late in the
 * evening.
 */
export function readableDate(at) {
  if (at === null || at === undefined || at === '') return '';

  let when;
  if (at instanceof Date) {
    when = at;
  } else {
    const ms = Number(at);
    // Zero is how "never recorded" is stored, and it is not a date -- it is
    // the first of January 1970, which would render as a renewal that happened
    // before anybody was born. Exactly the trap `dayKey` in habitDays.js
    // carries a scar from, and `clampScale` before it: a falsy number sails
    // through a NaN check and comes back looking like a real answer.
    if (Number.isFinite(ms)) {
      if (ms <= 0) return '';
      when = new Date(ms);
    } else {
      // A string that is not a number at all -- an ISO date, say. Not reached
      // by anything here today, and kept because the alternative is a silent
      // wrong answer the day something passes one.
      when = new Date(String(at));
    }
  }

  if (Number.isNaN(when.getTime())) return '';
  return `${when.getDate()} ${MONTHS[when.getMonth()]} ${when.getFullYear()}`;
}

export function planLabel(plan) {
  return PLAN_LABELS[String(plan || 'free')] || PLAN_LABELS.free;
}

export function isSettledPlan(plan) {
  return SETTLED_PLANS.includes(String(plan || ''));
}

/**
 * Everything the panel needs to draw itself.
 *
 * `action` is what the button does — and there are only ever three answers,
 * because a subscription page with more choices than that is a support queue:
 * send them to a checkout, send them to the portal, or say nothing.
 */
export function subscriptionView({
  plan = 'free',
  status = '',
  periodEndsAt = 0,
  gracePeriodEndsAt = 0,
  now = Date.now()
} = {}) {
  const name = String(plan || 'free');
  const label = planLabel(name);

  // Never sold anything. An unlimited account has no ceiling to lift, and
  // offering one reads as not knowing who you are talking to.
  if (name === 'owner') {
    return { tone: 'settled', label, detail: 'No storage limit on this account.', action: null };
  }

  // A card that failed, inside the window before it lapses. Said first,
  // because it is the only state with a deadline the person can still act on.
  if (isSettledPlan(name) && status === 'past_due') {
    const by = readableDate(gracePeriodEndsAt);
    return {
      tone: 'attention',
      label,
      detail: by
        ? `Your last payment did not go through. Update your card before ${by} to keep ${label}.`
        : 'Your last payment did not go through. Update your card to keep this plan.',
      action: 'manage'
    };
  }

  if (isSettledPlan(name)) {
    const until = readableDate(periodEndsAt);

    // Cancelled is not over. They paid for the period and they keep it, and
    // saying so is what stops "I cancelled and lost it immediately".
    if (status === 'canceled') {
      return {
        tone: 'ending',
        label,
        detail: until
          ? `Cancelled. You keep ${label} until ${until}, then the account returns to Free.`
          : `Cancelled. You keep ${label} until the end of the paid period.`,
        action: 'manage'
      };
    }

    return {
      tone: 'settled',
      label,
      detail: until ? `Renews on ${until}.` : 'Active.',
      action: 'manage'
    };
  }

  // Grandfathered: more room than Free, less than Pro, and nothing was ever
  // paid for it. Worth offering the upgrade, never worth implying they are
  // behind on something.
  if (name === 'legacy') {
    return {
      tone: 'free',
      label,
      detail: 'You keep the storage you already had. Pro adds more room for images and music.',
      action: 'upgrade'
    };
  }

  return {
    tone: 'free',
    label,
    detail: 'Pro raises the cloud storage limit, for notes with images and music in them.',
    action: 'upgrade'
  };
}
