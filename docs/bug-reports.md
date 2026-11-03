# Bug reports — MiniLend

Found on a local build (`npm run dev`) with fresh seed data (`npm run reset`), Chrome, 3 Nov 2026.

---

## BUG-01 — Accepting an offer doesn't close competing offers, so the same loan can be sold to two investors

| | |
|---|---|
| **Severity** | Critical (blocker) |
| **Priority** | Highest |
| **Component** | Offers / backend: `offer-service.ts` → `closeSale`, `acceptOffer`, `acceptCounter` |
| **Rule broken** | Rule 6: "When an offer is accepted, the loan becomes sold, and all other pending or countered offers on that loan are rejected automatically. A sold loan accepts no new offers or actions." |
| **Automated test** | `competing offers: investors see only their own, and accepting one closes the other` (marked `test.fail()` until fixed) |

**Preconditions:** Fresh seed data. Loan #3 (Emily Carter, Phoenix) is *Under Offer*, with pending offers from Marcus Chen ($350,000) and Priya Raman ($352,500).

**Steps to reproduce**
1. Sign in as **Lender (Dana Whitfield)** and open loan **#3 · Emily Carter**.
2. On Marcus Chen's offer, click **Accept**.
3. Look at Priya Raman's offer in the same table.
4. Click **Accept** on Priya Raman's offer.
5. (Optional) Sign in as **Investor B (Priya Raman)** and open loan #3.

**Expected result**
- After step 2: the loan is *Sold*, Marcus's offer is *Accepted*, and Priya's offer is automatically *Rejected* with no actions left on it.
- Step 4 is impossible. There is no Accept button, and the API returns 400 ("This loan is sold…").

**Actual result**
- After step 2: the loan shows *Sold*, but Priya's offer stays *Pending* with **Accept / Reject / Counter** buttons still shown.
- Step 4 succeeds (HTTP 200, toast "Offer from Priya Raman accepted. The loan is sold."). The loan now has **two Accepted offers**: $350,000 to Marcus and $352,500 to Priya.
- Priya, as an investor, sees a *Sold* loan with her offer still *Pending* and a **Withdraw offer** button.
- The same root cause applies to counter-offers. An investor holding a *Countered* offer on a loan that was sold to someone else can still click **Accept counter**, which also succeeds.

**Evidence**
- `docs/evidence/bug01-1-before-two-pending.png`: two pending offers.
- `docs/evidence/bug01-2-sold-but-priya-still-pending.png`: loan Sold, Priya still Pending with action buttons.
- `docs/evidence/bug01-3-investor-b-view-sold-loan-offer-pending.png`: investor view of the same state.
- `docs/evidence/bug01-4-two-accepted-offers.png`: final state, two Accepted offers on one loan.
- API reproduction:
  ```
  POST /api/offers/2/accept   → 200 {"status":"accepted","loan_status":"sold"}
  GET  /api/loans/3           → offer 3 (Priya) still "pending"
  POST /api/offers/3/accept   → 200 {"status":"accepted","loan_status":"sold"}
  ```

**Likely cause (for the developer):**
- `closeSale()` sets the offer to accepted and the loan to sold, but never updates the other active offers on that loan.
- `acceptOffer()` and `acceptCounter()` don't call `ensureLoanOpen()`, unlike reject, counter and withdraw.

So the second accept isn't blocked. Fix both: reject the other active offers inside the same transaction, and refuse accepts on closed loans. A database constraint (one accepted offer per loan) would be a good safety net.

**Impact:** The core business rule of the marketplace fails. One loan is sold twice, both investors are told they bought it, and recovering means manual data correction and an awkward conversation with an investor.

---

## BUG-02 — A counter-offer has no price limits, so a loan can be sold for $1

| | |
|---|---|
| **Severity** | High |
| **Priority** | High |
| **Component** | Offers / backend: `offer-service.ts` → `counterOffer`; frontend counter modal |
| **Rule broken** | Rule 1 (80%–105% of asking price) can be bypassed through the counter step. The spec only says "counter asks for a counter price". It doesn't limit that price, so product should confirm the intended rule. As built, though, a sale can close at any price at all. |

**Preconditions:** Fresh seed data. Loan #1 (Michael Harris, Austin) is *Listed* with an asking price of $420,750, so offers must be between $336,600 and $441,787.50.

**Steps to reproduce**
1. Sign in as **Investor A (Marcus Chen)**, open loan **#1 · Michael Harris**, and offer **400000**. The offer is *Pending*.
2. Sign in as **Lender (Dana Whitfield)**, open loan #1, and click **Counter** on Marcus Chen's offer.
3. Enter **1** as the counter price and click **Send counter**.
4. Sign in as **Marcus Chen**, open loan #1, and click **Accept counter**.

**Expected result:** The counter price is held to the same 80–105% range as offers ($336,600–$441,787.50), or at least to a range that product defines. At step 3, a counter of $1 is refused with a clear message, just as an out-of-range offer is.

**Actual result**
- Step 3 succeeds with the toast "Counter-offer of $1.00 sent to Marcus Chen."
- Step 4 succeeds: the offer is *Accepted* at a counter price of **$1.00** and the loan is *Sold*.
- The server only checks that the counter price is greater than 0. The modal does the same.
- Counters far **above** 105% are also accepted, for example $5,000,000 on a $420,750 asking price.

**Evidence**
- `docs/evidence/bug02-1-counter-at-1-dollar.png`: counter modal with $1.
- `docs/evidence/bug02-2-counter-accepted-by-server.png`: offer *Countered* at $1.00.
- `docs/evidence/bug02-3-loan-sold-for-1-dollar.png`: investor view, loan *Sold*, accepted at $1.00.
- API reproduction: `POST /api/offers/{id}/counter {"counter_price":1}` → 200 `{"status":"countered","counter_price":1}`.

**Impact:** One typo by the lender (a missing digit, or a counter typed in thousands) sells a $420k loan for a few dollars. The investor can accept it at once, and nothing stops it. It also lets the price rule be bypassed entirely.

---

## BUG-03 — An offer ending in "." (e.g. `340000.`) breaks the field and shows a wrong "Enter the price" error

| | |
|---|---|
| **Severity** | Medium |
| **Priority** | Medium |
| **Component** | Frontend: Loan details → *Make an offer* (`LoanDetailsPage.vue`, `submitOffer`; `VTextField type="number"`) |
| **Found by** | Manual exploratory testing (typing the amount by hand) |

**Preconditions:** Fresh seed data. Signed in as **Investor A (Marcus Chen)**. Loan #1 (Michael Harris) is *Listed*, so offers must be between $336,600 and $441,787.50.

**Steps to reproduce**
1. Open loan **#1 · Michael Harris**.
2. Click the **Offered price** field and type `340000.` (with a dot at the end, as a user does when they're about to type cents).
3. Click **Submit offer** (or press Enter).

**Expected result:** One of two outcomes:
- `340000.` is read as $340,000.00, a valid amount inside the range, and the offer is sent.
- The field shows a precise message such as "Enter a valid amount, e.g. 340000 or 340000.50", and the typed value stays readable.

**Actual result**
- The field visually breaks. The floating label "Offered price" drops back onto the typed number, so the two overlap, and the **$** prefix disappears.
- The red error says **"Enter the price you want to offer."**, which is wrong because the user did enter a price.
- No request is sent to the server. The user can't tell what is wrong.

The same happens with any input the browser considers an incomplete number (e.g. `340000..5`).
- `340000.5` works.
- `340000,5` works, because Chrome converts the comma to a dot.

**Evidence**
- `docs/evidence/bug03-1-typed.png`: the field shows `$ 340000.` before submitting.
- `docs/evidence/bug03-2-after-submit.png`: after submitting, the label overlaps the value, the $ prefix is gone, and the error message is wrong.
- Browser console: `Invalid keyframe value for property transform: translate(0px, 0px) scale(NaN)`, from the label animation.
- DOM check: the input shows `340000.`, but `input.value === ""` and `validity.valid === false`.

**Likely cause (for the developer):** For `<input type="number">`, the browser returns an empty `value` when the text isn't a complete number. `submitOffer()` checks `!offeredPrice.value` and shows the "empty" message. Vuetify sees an empty model and resets the label to its placeholder position, while the browser still displays the raw text. Fixes:
- Use a text input with `inputmode="decimal"` and parse it yourself, accepting a trailing dot.
- Or check `validity.badInput` and show a specific message.

The counter-offer field and the "List a new loan" form use the same pattern, so check them too.

**Impact:** Investors who type amounts naturally hit a confusing dead end on the main action of the app. There's no data damage, but it blocks or slows offers and looks broken.
