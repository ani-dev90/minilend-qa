# MiniLend — QA home assignment

Playwright + TypeScript workflow tests for MiniLend, plus the test plan, bug reports and AI notes.

| Deliverable | Where |
|---|---|
| A. Test plan | [`docs/test-plan.md`](docs/test-plan.md) |
| B. Automated workflow tests | [`tests/offer-workflows.spec.ts`](tests/offer-workflows.spec.ts), with helpers in [`tests/support/minilend.ts`](tests/support/minilend.ts) |
| Manual walkthrough of every test step | [`docs/test-walkthrough.md`](docs/test-walkthrough.md) |
| C. Bug reports (3) | [`docs/bug-reports.md`](docs/bug-reports.md), screenshots in [`docs/evidence/`](docs/evidence) |
| D. How I used AI | [`docs/ai-notes.md`](docs/ai-notes.md), agent instructions in [`CLAUDE.md`](CLAUDE.md) |

## Setup

Prerequisite: **Node.js 22.18+**, the same as the app.

```
<any folder>/
  minilend/       ← the app from the assignment (unchanged)
  minilend-qa/    ← this repo
```

```bash
# 1. The app (once)
cd minilend && npm install

# 2. The tests (once)
cd ../minilend-qa
npm install
npx playwright install chromium
```

If the app lives somewhere else, set `MINILEND_DIR=/path/to/minilend`.

## Run

```bash
npm test               # headless, all tests
npm run test:headed    # watch it in a browser
npm run report         # open the HTML report of the last run
```

Playwright starts the app (`npm run dev` in the app folder) if it isn't already running on :5173. Before the run it resets the app's data with the app's own `npm run reset`.

### Expected result

```
✓ lender lists a loan, investor offers, lender counters, investor accepts → loan sold at the counter price
✘ competing offers: investors see only their own, and accepting one closes the other   ← expected failure (BUG-01)
✓ price limits, expiry and relisting: …
3 passed
```

The second test asserts the spec (rule 6) and **currently fails because of BUG-01**. It is marked `test.fail()`, so the suite stays green while the bug is open. Once the bug is fixed, Playwright reports that test as *unexpectedly passed*, which signals that the marker can be removed. The error message in the trace or HTML report shows exactly which assertion catches the bug.

## The tests

All three are cross-user workflows. Each user (Lender, Investor A, Investor B) gets their own browser context, so they act side by side as real users would. Every test lists its **own new loan** through the UI, so tests don't depend on seed data or on each other.

| Test | Users | Rules covered | Checks the real result by… |
|---|---|---|---|
| Counter → accept → sold | Lender, Investor A | 1, 4, 5, 6 | Loan status from both sides, offer *Accepted* at the counter price, loan gone from the investor's marketplace, lender's *Sold* tile +1, and the API record (`offered 360k, counter 390k, accepted`) |
| Competing offers *(known bug)* | Lender, Investor A, Investor B | 3, 6 | Investor B sees neither A's name nor A's price, in the UI or the API. After the lender accepts A, B's offer must be *Rejected* with no actions left, and the loan has exactly one accepted offer |
| Price limits, expiry, relisting, withdraw | Lender, Investor A | 1, 4, 7, 8 | 79.99…% and 105.00…% are refused and nothing is created, while exactly 80% is accepted. Withdraw is refused while Under Offer. After +48h the offer is *Expired* with no Accept button, the loan is back to *Listed*, the investor can offer again, and after withdrawal the loan is gone from the marketplace |

### Selectors (no app changes)

The app has no test attributes, so the tests use what a user sees:
- roles and accessible names (`getByRole('button', { name: 'Accept offer from Marcus Chen' })`, which uses the app's existing aria-labels)
- form labels (`getByLabel('Offered price')`)
- table rows filtered by visible text

All locators live in one place, [`tests/support/minilend.ts`](tests/support/minilend.ts). The only CSS class used is `.v-snackbar`, for the toast. [`docs/test-plan.md`](docs/test-plan.md#what-i-would-add-to-the-app-if-i-could-testability) lists the test ids and test hooks I would add.

### Design notes

- **`workers: 1`.** Every test shares one SQLite database, and *Simulate time +48h* expires every active offer in it, so the tests run in series.
- **API checks.** Each user's API calls reuse their browser session (`page.request`), so the tests check the stored data as well as the screen.
- **Failure artifacts.** Traces, screenshots and video are kept for failed tests (`test-results/`).
