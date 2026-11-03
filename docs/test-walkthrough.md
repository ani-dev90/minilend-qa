# Test walkthrough — automated vs. manual, step by step

For each automated test, this shows what the code does, how to repeat it by hand, and why the code is written that way. Code is in [`tests/offer-workflows.spec.ts`](../tests/offer-workflows.spec.ts), with helpers in [`tests/support/minilend.ts`](../tests/support/minilend.ts).

**Before you start**
- App: <http://localhost:5173>. Run `npm run reset` in the app folder for fresh data.
- Password for all users: `MiniLend2026!`. Clicking a card on the login page fills it in.
- To have two users logged in at once, use a normal window and an Incognito window (Cmd+Shift+N). For a third user, use another browser, or log out and back in.
- Every test lists its own loan with **asking price $400,000**, so the offer range is **$320,000 – $420,000** (80% – 105%).

---

## Setup (runs before the tests)

| What | Code | Why |
|---|---|---|
| Reset data | `global-setup.ts` runs the app's own `npm run reset` | Every run starts from the same demo data, without touching app code |
| One test at a time | `workers: 1` in `playwright.config.ts` | All tests share one database, and *Simulate time +48h* expires every offer in it |
| Start the app | `webServer: npm run dev`, `reuseExistingServer: true` | Starts the app if it isn't already running |
| One browser per user | `browser.newContext()` per fixture (`lender`, `investorA`, `investorB`) | Separate cookies work like separate people, so several users act side by side |
| Login | Click the user card → **Sign in** → expect the **Marketplace** heading and the "Account menu for &lt;name&gt;" button | Elements are found by role and visible name (there are no test ids). The account-menu check proves the *right* user is logged in |
| Unique loan | `newLoan()` names it `QA <label> <random>` | Tests never depend on demo data or on each other |
| Failure evidence | `trace` / `screenshot` / `video`: retain on failure | You can see exactly what happened when a test fails |

---

## Test 1 — Counter → accept → loan sold

Users: **Lender + Investor A** · Rules 1, 4, 5, 6 · `offer-workflows.spec.ts:4`

| # | You do | The code checks | Why |
|---|---|---|---|
| 1.1 | As **Dana**, open **My Activity** and note the **Sold** tile (1 on fresh data) | `soldBefore = summaryCount("Sold")` | Used in step 1.10 to prove the sale was counted |
| 1.2 | **List a new loan**: `QA counter 1`, `Austin, TX`, `400000`, `6.5`, `400000` → **List loan**, then open the loan and note its number | Toast "Loan for … is now listed.", row shows **Listed**, loan id read from the URL | Waits for the table to reload before clicking the row (see note below) |
| 1.3 | Check the chip next to the title says **Listed** | `loanHeader()` contains "Listed" | Starting state |
| 1.4 | As **Marcus**, find the loan on the Marketplace (Listed), open it, offer `360000` → **Submit offer** | Toast "Your offer was sent to the lender.", **Your offer** box shows **Pending**, chip shows **Under Offer** | The new loan reaches the other user. Rule 1: price inside the range. Rule 4: the first offer moves the loan to Under Offer |
| 1.5 | As **Dana**, open the loan; Marcus's row shows $360,000.00 → **Counter** → `390000` → **Send counter** | Row shows **Countered** and "Waiting for investor" | Button found by the label "Counter offer from Marcus Chen", so it can't click the wrong investor. Rule 5 |
| 1.6 | As **Marcus**, **refresh** the page and check the box shows **Countered** at $390,000.00 → **Accept counter** | Toast "Counter-offer accepted. The loan is yours." | The page doesn't update by itself, so a real user refreshes too |
| 1.7 | Check the chip shows **Sold**, the note says "This loan is no longer open for offers.", and the $390,000.00 row shows **Accepted** | Same, in the UI | The row is found by $390,000, which proves the sale closed at the **counter** price |
| 1.8 | As **Dana**, refresh and check: **Sold**, Marcus's row **Accepted**, no **Withdraw loan** button | Same | Both sides must agree. A sold loan offers no more actions |
| 1.9 | As **Marcus**, open **Marketplace** and check the loan is gone | `marketplaceRow(...)` has count 0 | Investors only see open loans |
| 1.10 | As **Dana**, open **My Activity** and check **Sold** is one higher | `summaryCount("Sold") === soldBefore + 1` | The sale shows up in the lender's summary |
| 1.11 | As **Dana**, open `http://localhost:5173/api/loans/<id>` | `status: "sold"` and one offer with `offered_price 360000`, `counter_price 390000`, `status "accepted"` | Checks the stored data, not only the screen |

**Note on step 1.2:** after saving, the page reloads the loans table. Clicking the row during that reload was sometimes lost (this was the first-run flake), so `listLoan()` waits for the `GET /api/loans` response and for the dialog to close first.

---

## Test 2 — Two investors compete on the same loan ⚠️ catches BUG-01

Users: **Lender + Investor A + Investor B** · Rules 3, 6 · `offer-workflows.spec.ts:64`

The test is marked `test.fail()` with a "known bug" annotation. It asserts the **spec**, and the app currently fails at step 2.5. When BUG-01 is fixed, Playwright reports "unexpectedly passed", so the marker gets removed. The assertion was deliberately not changed to match the broken behaviour.

| # | You do | The code checks | Why |
|---|---|---|---|
| 2.1 | As **Dana**, list `QA competing 1` (same values as Test 1) | Loan created | A fresh loan for this scenario |
| 2.2 | As **Marcus**, offer `380000`. As **Priya**, offer `395000` on the same loan | Both offers **Pending** | Two active offers on one loan, the situation where rule 6 matters |
| 2.3 | On Priya's page, **Cmd+F** for `Marcus` and `380,000`: no results. Then open `/api/loans/<id>` as Priya | No "Marcus Chen" and no "$380,000.00" on her page. The API returns only her own offer | Rule 3, privacy. The API is checked too, because it can leak what the screen hides |
| 2.4 | As **Dana**, open the loan (**Offers (2)**) and click **Accept** on **Marcus's** row | Toast "…accepted. The loan is sold.", chip **Sold**, Marcus's row **Accepted** | The button is found by the label "Accept offer from Marcus Chen", which guarantees the right offer |
| 2.5 | ❌ Look at **Priya's** row | Expected **Rejected** with no Accept button. **Actual: Pending, with Accept / Reject / Counter.** Clicking Accept works, and you get two Accepted offers | Rule 6. **The test fails here: BUG-01** |
| 2.6 | As **Priya**, refresh | *(not reached yet)* Expected Sold, her $395,000 offer **Rejected**, no **Withdraw offer** button | The same check from the investor's side |
| 2.7 | `/api/loans/<id>` | *(not reached yet)* Expected exactly **one** accepted offer | Data rule: a loan can never have two buyers |

---

## Test 3 — Price limits → expiry → back to Listed → withdraw

Users: **Lender + Investor A** · Rules 1, 4, 7, 8 · `offer-workflows.spec.ts:115`

| # | You do | The code checks | Why |
|---|---|---|---|
| 3.1 | As **Dana**, list `QA expiry 1` (same values) | Loan created | Fresh loan |
| 3.2 | As **Marcus**, offer `319999.99`, then `420000.01` | Both show "Offered price must be between $320,000.00 and $420,000.00". The chip stays **Listed** and the API shows `offers: []` | Rule 1 at its edges, one cent outside each limit. Proves nothing was saved |
| 3.3 | Offer `320000` (exactly 80%) | **Pending**, chip **Under Offer** | "Inclusive" means exactly 80% must work. Re-checks rule 4 |
| 3.4 | As **Dana**, click **Withdraw loan** | Red toast "Only listed loans can be withdrawn. This loan is under offer.", chip still **Under Offer** | Rule 8: refused while an offer is active, and nothing changed |
| 3.5 | **My Activity** → **Simulate time +48h** | Toast matches `/offers? expired/` | Rule 7 without waiting. The count varies because the button expires **every** active offer, demo ones included |
| 3.6 | Open the loan again | Marcus's row **Expired**, no Accept button, chip back to **Listed** | "An expired offer cannot be accepted." A loan that loses its last active offer returns to Listed |
| 3.7 | As **Marcus**, refresh | The $320,000.00 offer shows **Expired**, and the **Make an offer** form is back | Rule 2: a new offer is allowed once the old one is closed |
| 3.8 | As **Dana**, click **Withdraw loan**. Then as **Marcus**, open **Marketplace** | Toast "Loan withdrawn from the marketplace.", chip **Withdrawn**, the loan is gone from the marketplace | Rule 8 from the allowed side: the same button that was refused in 3.4 now works |

---

## Watch one test step by step

```bash
npx playwright test -g "counter"   --headed --debug   # Test 1
npx playwright test -g "competing" --headed --debug   # Test 2
npx playwright test -g "expiry"    --headed --debug   # Test 3
```

`--debug` opens the Playwright Inspector. **Step over** runs one line at a time and highlights it in the browser. After any run, `npm run report` shows each step with screenshots.
