# CLAUDE.md — agent instructions for this repo

## Context
- This repo holds QA work for **MiniLend**, a loan marketplace (Vue 3 + Vuetify frontend, Express + SQLite API). The app lives in `../minilend` (or `$MINILEND_DIR`).
- **Source of truth for behaviour:** the assignment PDF's 8 business rules and the app's `README.md`. When the code and the spec disagree, the spec wins, and the disagreement is a bug to report. Never "fix" a test to match buggy behaviour.

## Hard rules
- **Never modify the application code** in `../minilend`. Read it to understand behaviour and to find likely bugs, but work only with what is there.
- Reset data only through the app's own `npm run reset`. Don't write to `backend/minilend.db` directly.
- Don't claim a bug from reading code alone. Reproduce it against the running app (UI or API) and save evidence in `docs/evidence/`.
- Don't claim a test passes without running it. Run `npx playwright test` and report the real output.

## Writing tests
- Playwright + TypeScript. Tests go in `tests/`, and shared locators and helpers in `tests/support/minilend.ts` only.
- Test **workflows across users**, not single screens. Each user gets their own browser context (fixtures `lender`, `investorA`, `investorB`).
- Assert the **outcome** of the flow: statuses from each user's side, prices, what disappears, summary counts, and the API record through `page.request`. "Page opened" is never the assertion.
- Every test creates its own loan with `newLoan()`. Don't depend on seed data or test order.
- **Selectors:**
  - Use, in order: `getByRole` with an accessible name → `getByLabel` → text filtered rows.
  - Use CSS classes only as a last resort, and comment why.
  - Never use `waitForTimeout`. Wait on a visible result or a specific network response.
- When a test asserts the spec and fails because of a confirmed bug, mark it `test.fail()` with an annotation pointing to the bug id. Never weaken the assertion.

## Writing docs
- Keep it short and plain. Bug reports follow Jira style: title, severity, preconditions, steps, expected vs. actual, evidence, impact.
- Mark anything uncertain (for example, a rule the spec doesn't define) as a question for product, not as a fact.
