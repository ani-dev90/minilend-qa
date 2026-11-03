# Test plan — MiniLend

## The 5 most important things to test (in priority order)

| # | Area | Why it comes first |
|---|------|--------------------|
| 1 | **Closing a sale** (rule 6): accept / accept-counter sells the loan, closes every other active offer, and locks the loan | This is the money moment. A loan must end up with exactly one buyer at one price. A failure here is a legal and financial problem, not a UI glitch. |
| 2 | **Offer state machine and permissions** (rules 2, 5): which role can take which action on an offer in which state, enforced by the server | Every workflow passes through it. A wrong transition, such as acting on a closed offer or one investor acting on another's offer, breaks every downstream status. |
| 3 | **Investor privacy** (rule 3): an investor never sees other investors' offers, names or prices, in the UI or the API | Leaking a competitor's bid destroys the fairness of the marketplace and is a data-protection issue. It can't be undone after the fact. |
| 4 | **Price rules** (rule 1): 80–105% inclusive, cent rounding, and what a *counter* price may be | Invalid prices are how bad deals get in. Boundaries and rounding are classic defect spots. |
| 5 | **Time and loan status** (rules 4, 7, 8): the first offer moves the loan to Under Offer; expiry; going back to Listed; withdrawal only when Listed | These are time-based, multi-step transitions that are easy to get wrong and hard to notice by clicking around. |

## How I would test it

**Automated end-to-end (Playwright, in this repo).** A small number of real cross-user workflows through the UI, each checking the outcome from every side: lender view, investor view, marketplace, My Activity summary, and the API. There are three today: counter → accept → sold; competing offers plus privacy plus auto-reject; and price limits plus expiry plus relist plus withdraw. Keep this layer thin. It is slow and selector-dependent, so it covers the flows, not every rule combination.

**API level (where most of the rule coverage belongs).** A table-driven matrix: *every action × every offer status × every loan status × every role*, with the expected result (200, 400 with reason, 403, or 404). It also covers:
- Price boundaries: 79.99%, 80%, 105%, 105.01%, and amounts that round on cents.
- Authorization and IDOR checks: Investor B calls accept-counter or withdraw on Investor A's offer id, an investor calls lender endpoints, and a request is made without a cookie.
- Concurrency: two `accept` calls on different offers of the same loan fired in parallel, accept racing withdraw, and a double-click on Submit offer.
- Privacy: no endpoint returns another investor's `investor_name` or `offered_price` to an investor (`/loans`, `/loans/{id}`, `/activity`).

**Data level (SQLite invariants, checked after every API or E2E test).**
- A loan has at most one `accepted` offer, and a `sold` loan has exactly one.
- A `sold` or `withdrawn` loan has no `pending` or `countered` offers.
- An `under_offer` loan has at least one active offer, and a `listed` loan has none.
- An accepted price, whether the offer or the counter, falls inside the allowed range.

These catch broken states that the UI hides. BUG-01 is visible here immediately as two accepted offers on one loan.

**Manual / exploratory** (this is where BUG-03 was found).
- Wording of error messages and toasts.
- Sorting and filters on Marketplace and My Activity.
- Number input edge cases: negative numbers, `e`, very large values, pasted text.
- Back and refresh during actions.
- Two tabs as the same user going stale. For example, the lender keeps an old page open with an Accept button after the loan was sold elsewhere.
- Seed-data walkthrough against the README.
- Visual checks of status chips.

## What I would add to the app if I could (testability)

- **`data-testid` hooks** on:
  - offer table rows, carrying the offer id (`data-offer-id`)
  - status chips (`data-status="pending"`), so tests assert on a value and not on label text
  - the loan header, the summary tiles and the toast
- **A test clock or seed API** (enabled only in a test environment): set "now", and create a loan with given offers in one call. Each test could then build its own state in milliseconds. This would also remove the global side effect of "Simulate time +48h", which today expires *every* active offer in the database. That side effect is why the suite runs with one worker.
- **A health endpoint** for the `webServer` readiness check.

## Other observations (not filed as bugs)

- The lender sees a **Withdraw loan** button on loans that are *Under Offer*. The server correctly refuses, but the UI offers an action that rule 8 never allows. The button should be hidden or disabled with a reason.
- A counter price can also be set **above** 105% of the asking price. This is the same gap as BUG-02, in the other direction.
- **Switch user** and **Log out** do the same thing.
- **My Activity → Simulate time +48h** expires every active offer for all lenders and loans, not only the current lender's. That's fine for a demo, but worth knowing when testing.

## If I had more time — next steps

1. Build the API-level state-machine matrix and the invariant checker described above.
2. Write a parallel-accept concurrency test. `closeSale` doesn't re-check the loan status inside its transaction.
3. Add a privacy sweep test over every investor-facing endpoint.
4. Run in CI on every PR, and add Firefox and WebKit projects.
