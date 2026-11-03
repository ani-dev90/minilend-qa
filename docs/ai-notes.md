# How I used AI

**Tool:** Claude Code (CLI agent) with read access to the app, a terminal and a browser driven by Playwright. Its standing instructions are in [`CLAUDE.md`](../CLAUDE.md): don't touch app code, spec over code, reproduce before reporting, run before claiming.

## Main prompts

1. *"Read the assignment PDF and the app (README, backend services, routes, Vue views). Summarize the business rules and, for each rule, where the server enforces it. List anything in the code that looks inconsistent with the spec."*
2. *"Reproduce each suspected bug against the running app through the API, with fresh seed data. Show me the raw requests and responses."*
3. *"Write 3 Playwright + TypeScript tests that follow full cross-user workflows. Use role and label selectors only (no test ids exist). Assert final states from every user's side and through the API. Put locators in one helper file."*
4. *"Run the suite 3 times. For any failure, tell me whether it is a test problem or an app bug, with evidence."*
5. *"Write the two bug reports in Jira format with screenshots. Write the test plan in half a page."*

## What the AI did well
- **Code-reading for risk.** It spotted from `offer-service.ts` that `closeSale()` never touches the other offers, and that `acceptOffer` and `acceptCounter` skip `ensureLoanOpen()`. That pointed straight at BUG-01 before any clicking.
- **Fast reproduction.** It turned suspicions into curl scripts against the API, which confirmed the double sale and the $1 counter in minutes.
- **Selector strategy.** It found the app's existing aria-labels (`Accept offer from …`, `Counter offer from …`), which made stable, readable locators possible without test ids.

## What it got wrong, and how I caught it
- **A flaky helper it wrote.** The first version of `listLoan()` clicked the new loan's row link right after saving. The page re-fetches the table at that moment, so the click was sometimes lost and the test failed on the URL check. I caught it on the first run, because the failure was in the helper and not in an app assertion. The fix waits for the table's `GET /api/loans` response and for the dialog to close. It then passed 3 out of 3 runs in a row.
- **An untested claim in a draft.** The BUG-02 draft said a counter far *above* 105% is also accepted, before that had been tried. I made it verify the claim with a real request ($5,000,000 counter → HTTP 200) before keeping the sentence.
- **Hiding a real failure.** For the competing-offers test, the easy path was to change the assertion to match what the app does. I kept the assertion on the spec, marked the test `test.fail()` and linked it to BUG-01. To check that it fails for the *right* reason, I ran it once without the marker. It fails exactly at `offerRow('Priya Raman') → expected "Rejected", received "Pending"`, and not on a selector.
- **It missed a bug a human found in seconds (BUG-03).** The AI had marked "number input edge cases" as manual testing in the test plan, but it never actually typed into the field like a person. Its checks sent clean numbers straight to the API, and its Playwright tests used `fill('360000')`, which never produces a half-typed value like `340000.`. So it reported the offer form as working. I found the bug by hand: typing `340000.` breaks the field and shows a wrong "Enter the price" error. I then had the AI reproduce it (the browser reports `input.value === ""` for that text), capture evidence and write it up. **Lesson:** an API check plus a scripted `fill()` doesn't replace typing the way a real user does. Character-by-character input (`pressSequentially`) and manual exploratory passes on every money field belong in the plan as real steps, not as a line in a list.
- **Environment.** It first tried `brew install node`. On this macOS version Homebrew has no prebuilt package, so it would compile Node from source. I stopped that and used the official Node 24 LTS binary instead.

## Control over the result
- I reviewed every assertion against the 8 rules myself.
- Every bug was reproduced in the UI with screenshots, not only described from the code. BUG-03 came from my own manual testing, not from the AI.
- I ran the suite before writing any "it passes" statement.
