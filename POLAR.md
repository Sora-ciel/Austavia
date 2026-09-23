# Turning the paywall on

Everything in the app is built. What is left is the part that lives in
somebody's dashboard rather than in this repo, and it has to be done in this
order — each step is what makes the next one possible.

Polar is the **merchant of record**. It sells the subscription in its own name,
which means EU digital-goods VAT is its problem in every buyer's country rather
than yours. That is the whole reason it is there instead of Stripe.

---

## What already works, and what it is waiting for

| | |
| --- | --- |
| `functions/polarAdapter.js` | Reads Polar's vocabulary and checks its signatures |
| `functions/entitlements.js` | Decides what a person is owed — cancelled, refunded, card failed |
| `functions/subscriptionRecord.js` | Decides what to write down, once, in the right order |
| `functions/subscriptions.js` | Writes the plan, the ceiling, and the token claim |
| `polarWebhook` in `functions/index.js` | The endpoint — **needs a deploy and a secret** |
| `sweepExpiredPlans` | Looks again daily, for the webhook that never arrives |
| `src/utils/checkout.js` | Builds the checkout and portal URLs — **needs links pasted in** |
| `src/utils/subscriptionStatus.js` | What the subscriber is told: renewal, cancellation, a failed card |
| The plan panel | In the right-hand Settings panel, above the storage bar |

All of it is exercised by `npm test`, and the endpoint itself end-to-end by
`npm run test:triggers` — real signed deliveries against the real function in
the emulator, including a forged one, a repeated one, and one with nobody
attached.

---

## 1. Sandbox first, always

`sandbox.polar.sh` is a separate account from `polar.sh` with its own products,
its own keys and test cards. Nothing done there can charge anybody. The whole
of this document is worth doing there first and then again for real — the
second run takes ten minutes.

## 2. Make the product

In the Polar dashboard: **Products → New Product**, a monthly recurring price.
The figure that was settled on is **around $8/month** — see the plan in memory;
the reasoning is that 71 subscribers at $8 is a business one person can run and
213 at $3 is a support job.

Then **Checkout Links → New Link** on that product, and copy the URL.

## 3. Put the link where it belongs

**The sandbox link goes in `.env.staging`**, which is not committed:

```
VITE_POLAR_CHECKOUT_LINK=https://sandbox-api.polar.sh/v1/checkout-links/.../redirect
```

**The live link is the committed default** in
[`src/utils/checkout.js`](src/utils/checkout.js), the same arrangement
`firebase.ts` uses for the project config.

**The customer portal goes in beside it**, as `VITE_POLAR_PORTAL_LINK`. It is
`polar.sh/<your-org-slug>/portal`, and it is where a subscriber changes their
card, takes an invoice or cancels. Without it there is no way out of a
subscription except emailing you, which is a support queue and, in the EU, not
allowed.

That split is not tidiness. A sandbox checkout behaves exactly like a real one
right up to the point where the money does not arrive, so a sandbox link left
in the committed default would ship to the live site and take nothing at all
from everybody who pressed it — and the first sign would be someone asking
where their subscription went. `test/checkout-link.test.js` fails the build if
the committed link ever says `sandbox`.

Until one of the two is set, nothing shows an upgrade button — deliberately, so
a half-finished paywall cannot offer a button that goes nowhere.

The app appends `?reference_id=<firebase uid>` to it. **That is the only thing
tying a payment to an account**, since the email someone types at a checkout is
very often not the one on their Google account.

## 4. Set the two secrets

**The signing secret**, which Polar shows when the endpoint is created
(step 6). Without it the webhook cannot tell a real delivery from anybody's:

```bash
firebase functions:secrets:set POLAR_WEBHOOK_SECRET
```

**An access token**, used for one thing only — ending a subscription after a
full refund, because Polar does not do that itself. Create it in the Polar
dashboard under **Settings → Developers**, and give it the
`subscriptions:write` scope and nothing else: a token that can do more than its
one job has a blast radius somebody else decided.

```bash
firebase functions:secrets:set POLAR_ACCESS_TOKEN
```

Neither goes in the repo or in a source file, and **sandbox and production get
different ones**. Which Polar is reached is keyed on the Firebase project, not
on a setting, so a staging deploy cannot revoke a real customer's
subscription — but a production token sitting in staging would be a real
token in a place that only ever needs a test one.

## 5. Deploy the functions

This is the step that is genuinely blocked today: **nothing in `functions/` has
ever been deployed**, because `ARIAL_SMTP_PASS` is declared and unset, and the
CLI resolves every secret in the codebase before working out which functions
you asked for. So a missing secret blocks the whole deploy, targeted or not.

Either set that secret too, or comment out the three `exports.bandwidth*` lines
in `functions/index.js` for now. Then:

```bash
firebase deploy --only functions,database
```

The database rules go with it: `subscriptions/{uid}` and `diagnostics/` are new
nodes, readable by their owner and by admins and writable by nobody.

The endpoint is then at:

```
https://us-central1-arial-473c1.cloudfunctions.net/polarWebhook
```

## 6. Point Polar at it

**Settings → Webhooks → Add Endpoint**, format **Raw**, and subscribe to:

- `subscription.created`, `subscription.active`, `subscription.updated`
- `subscription.canceled`, `subscription.uncanceled`, `subscription.revoked`
- `subscription.past_due`, `subscription.cycled`
- `order.refunded`

Anything else is harmless — the endpoint answers 200 and does nothing to events
that say nothing about entitlement.

## 7. Buy it from yourself

Sign into the app, open the right-hand panel, press **Upgrade storage**, and
pay with a sandbox test card (`4242 4242 4242 4242`, any future date, any CVC).

Then check, in the Firebase console:

- `sync/default/users/<your uid>/plan` — should read `pro`
- `storage/<your uid>` — `limit` should be 10 GB and `plan` should say `pro`
- `subscriptions/<your uid>` — the status, the period end, and the delivery ids
  it has already seen

**If the plan did not move, look at `diagnostics/polar/unmatched`.** A delivery
that arrives with no account attached is recorded there by *shape* — the event
type and the key names it carried, never a customer's details. That tells us
which key Polar put `reference_id` under, which is the one thing about this
integration the documentation does not say. One real checkout answers it, and
`uidFromEvent` in `polarAdapter.js` is where to add the key.

## 8. Then try the unhappy half

These are the ones that fail silently and always in the customer's favour, so
they are worth ten minutes each, once:

- **Cancel** it in Polar — the plan should stay `pro` until the period ends.
- **Refund** the order — the plan should drop immediately, **and the
  subscription should end at Polar too**.

  That second half is ours to do. Polar refunds the *order* and leaves the
  subscription running: its own docs say you cannot end access by refunding a
  subscription's order, only by cancelling it. Left alone that means Polar says
  "active" while Austavia says "free", which surfaces as the customer being
  unable to subscribe again on an account that is not subscribed — found
  exactly that way on 2026-09-21. So a **full** refund now calls Polar and
  revokes the subscription, which is what `POLAR_ACCESS_TOKEN` is for.

  A **partial** refund deliberately does not. `order.refunded` fires for those
  too, and a goodwill refund of one month must not end a subscription somebody
  is still paying for. If the payload does not make it clear which kind it was,
  nothing is revoked and the log says so — check `diagnostics/polar/revokeFailures`
  and the function logs if a refund ever leaves a subscription alive.
- **Revoke** one — the plan should drop at once, and `status` should read
  `none`. This is also what fires at the natural end of every cancelled
  subscription, so it is the common ending rather than the rare one.
- **Let it lapse** — `sweepExpiredPlans` runs daily at 04:00 UTC and is what
  catches a `subscription.revoked` that never arrived. Force-run it from Cloud
  Scheduler rather than waiting a month.

## 9. Going live

Repeat steps 2, 3, 4 and 6 against the real dashboard: a real product, a real
checkout link, a **new** signing secret, a new endpoint. The deployed function
does not change.

---

## Two things that are not about code

**Guadeloupe, and what Polar said about it** (their support, 2026-09-23).
France is the right account country: Guadeloupe is a French department, with a
French passport and a FR IBAN behind it. Three things were asked before the
first real sale, and two of them are now closed:

- **VAT on Polar's fees to you: none.** "Out of scope, no VAT, no reverse
  charge. Polar is a US entity, and since we have no VAT system to account for
  it under, nothing appears on our invoice to you regardless of your location
  inside or outside the EU VAT area." So the overseas-department question does
  not reach their invoice at all.
- **The reverse invoice with no VAT number: leave it empty.** The field is
  optional, and under *franchise en base* there is no number to put in it. It
  still stands as an income document.
- **Stripe KYC with a 971 postcode: no promise either way.** "It depends on
  actual Stripe verification history rather than anything in our docs or from
  our end" — which means Polar does not gate on it and Stripe decides. So do
  the verification **early**, before anybody is waiting on a payout, because
  that is the only way to find out and the cheapest moment to hit a snag.

What their answer does *not* cover is your own side of a purchase from a
non-EU supplier — whether anything has to be self-assessed on a French return,
and how that works from a department outside the EU VAT area. Polar is not in a
position to answer that and did not try. It is a question for a local
accountant, and it is the classic one to miss under *franchise en base*.

**The trademark filing is still open.** INPI classes 9 and 42 for Austavia —
unrelated to any of the above, but it is the other thing standing between this
and selling something under that name.
