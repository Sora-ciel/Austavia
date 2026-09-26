// Talking back to Polar.
//
// Everything else in this folder only ever *listens*. This is the one file
// that acts on the provider, which is why it is small, why every call is
// idempotent, and why it never throws for a state that is already what we
// wanted.
//
// It exists because of something found in the sandbox on 2026-09-21: refunding
// an order does not end the subscription it paid for. Polar documents that —
// the money goes back and the subscription carries on — so a refunded customer
// is still subscribed in Polar while being on the free plan here, and the way
// they find out is that Polar refuses to let them subscribe again.
//
// Remembering to press a second button every time is exactly the kind of thing
// CLAUDE.md says not to rely on.

const PRODUCTION_BASE = 'https://api.polar.sh';
const SANDBOX_BASE = 'https://sandbox-api.polar.sh';

/**
 * Which Polar to talk to.
 *
 * Keyed on the Firebase project, the same way the monitoring functions are:
 * production talks to production, and everything else — staging, an emulator —
 * talks to the sandbox. A variable would not do, because the one thing that
 * must never happen is a staging deploy reaching into the real Polar account
 * and revoking a paying customer's subscription.
 */
function apiBaseFor(projectId, productionProjectId) {
  return projectId && projectId === productionProjectId ? PRODUCTION_BASE : SANDBOX_BASE;
}

/**
 * Revoke a subscription — Polar's word for ending it right now.
 *
 * `DELETE /v1/subscriptions/{id}`, which sets the status to canceled, stamps
 * `ended_at`, and revokes the benefits. It does not refund anything; that is a
 * separate operation, and here it has already happened.
 *
 * Treated as success when Polar says the subscription is already revoked (403)
 * or no longer exists (404). Both mean the thing we wanted is true, and a
 * handler that threw on them would answer 500 to a webhook that had in fact
 * been dealt with, and be retried for ever.
 */
async function revokeSubscription({
  id,
  token,
  baseUrl = PRODUCTION_BASE,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!id) return { ok: false, reason: 'no-subscription-id' };

  // Trimmed, because a secret is typed or pasted by a person and a trailing
  // newline is invisible in every tool that shows one. A trailing one is
  // rejected as malformed, with the same 401 as a token that is genuinely
  // wrong -- and the two would be indistinguishable from the log.
  const bearer = String(token || '').trim();
  if (!bearer) return { ok: false, reason: 'no-token' };

  const response = await fetchImpl(`${baseUrl}/v1/subscriptions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json'
    }
  });

  if (response.status === 403 || response.status === 404) {
    return { ok: true, alreadyDone: true, status: response.status };
  }

  if (!response.ok) {
    // The body can carry a reason worth reading, and it is Polar's own text
    // about a subscription id — no customer details in it.
    let detail = '';
    try {
      detail = (await response.text()).slice(0, 300);
    } catch {
      detail = '';
    }
    return { ok: false, reason: 'http-error', status: response.status, detail };
  }

  return { ok: true, status: response.status };
}

module.exports = {
  PRODUCTION_BASE,
  SANDBOX_BASE,
  apiBaseFor,
  revokeSubscription
};
