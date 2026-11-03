import { expect, newLoan, test } from "./support/minilend";

test.describe("MiniLend offer workflows", () => {
  test("lender lists a loan, investor offers, lender counters, investor accepts → loan sold at the counter price", async ({
    lender,
    investorA,
  }) => {
    const loan = newLoan("counter");
    await lender.gotoActivity();
    const soldBefore = await lender.summaryCount("Sold");

    // Lender lists a new loan.
    const loanId = await lender.listLoan(loan);
    await expect(lender.loanHeader()).toContainText("Listed");

    // Investor A finds it in the marketplace and makes an offer (rule 1: inside 80–105%).
    await investorA.gotoMarketplace();
    await expect(investorA.marketplaceRow(loan.borrower)).toContainText("Listed");
    await investorA.openLoan(loanId);
    await investorA.makeOffer(360_000);
    await expect(investorA.toast()).toContainText("Your offer was sent to the lender.");
    await expect(investorA.myOfferCard()).toContainText("Pending");

    // Rule 4: the first offer moves the loan to Under Offer.
    await expect(investorA.loanHeader()).toContainText("Under Offer");

    // Lender sees the offer and counters it.
    await lender.openLoan(loanId);
    await expect(lender.offerRow(investorA.name)).toContainText("$360,000.00");
    await lender.counterOffer(investorA.name, 390_000);
    await expect(lender.offerRow(investorA.name)).toContainText("Countered");
    await expect(lender.offerRow(investorA.name)).toContainText("Waiting for investor");

    // Investor A sees the counter and accepts it.
    await investorA.page.reload();
    await expect(investorA.myOfferCard()).toContainText("Countered");
    await expect(investorA.myOfferCard()).toContainText("$390,000.00");
    await investorA.page.getByRole("button", { name: "Accept counter" }).click();
    await expect(investorA.toast()).toContainText("Counter-offer accepted. The loan is yours.");

    // Result, from every side: the loan is sold, at the counter price, and is off the market.
    await expect(investorA.loanHeader()).toContainText("Sold");
    await expect(investorA.page.getByText("This loan is no longer open for offers.")).toBeVisible();
    await expect(investorA.page.getByRole("row").filter({ hasText: "$390,000.00" })).toContainText("Accepted");

    await lender.page.reload();
    await expect(lender.loanHeader()).toContainText("Sold");
    await expect(lender.offerRow(investorA.name)).toContainText("Accepted");
    await expect(lender.page.getByRole("button", { name: "Withdraw loan" })).toBeHidden();

    await investorA.gotoMarketplace();
    await expect(investorA.marketplaceRow(loan.borrower)).toHaveCount(0);

    await lender.gotoActivity();
    expect(await lender.summaryCount("Sold")).toBe(soldBefore + 1);

    const data = await lender.apiLoan(loanId);
    expect(data.loan.status).toBe("sold");
    expect(data.offers).toEqual([
      expect.objectContaining({ investor_name: investorA.name, offered_price: 360_000, counter_price: 390_000, status: "accepted" }),
    ]);
  });

  test("competing offers: investors see only their own, and accepting one closes the other", async ({
    lender,
    investorA,
    investorB,
  }) => {
    test.info().annotations.push({
      type: "known bug",
      description: "BUG-01 in docs/bug-reports.md — other active offers are not rejected when an offer is accepted.",
    });
    // Expected to fail until BUG-01 is fixed. Playwright reports it as a pass while it fails,
    // and flags it as soon as the bug is fixed so the marker can be removed.
    test.fail();

    const loan = newLoan("competing");
    const loanId = await lender.listLoan(loan);

    await investorA.openLoan(loanId);
    await investorA.makeOffer(380_000);
    await expect(investorA.myOfferCard()).toContainText("Pending");

    await investorB.openLoan(loanId);
    await investorB.makeOffer(395_000);
    await expect(investorB.myOfferCard()).toContainText("Pending");

    // Rule 3: Investor B sees only their own offer — not Investor A's name or price.
    await expect(investorB.page.getByText(investorA.name)).toHaveCount(0);
    await expect(investorB.page.getByText("$380,000.00")).toHaveCount(0);
    const asSeenByB = await investorB.apiLoan(loanId);
    expect(asSeenByB.offers.map((o) => o.investor_name)).toEqual([investorB.name]);

    // Lender sees both offers and accepts Investor A's.
    await lender.openLoan(loanId);
    await expect(lender.page.getByRole("heading", { name: "Offers (2)" })).toBeVisible();
    await lender.page.getByRole("button", { name: `Accept offer from ${investorA.name}` }).click();
    await expect(lender.toast()).toContainText(`Offer from ${investorA.name} accepted. The loan is sold.`);
    await expect(lender.loanHeader()).toContainText("Sold");
    await expect(lender.offerRow(investorA.name)).toContainText("Accepted");

    // Rule 6: every other active offer on the loan is rejected automatically, and no action is left on it.
    await expect(lender.offerRow(investorB.name)).toContainText("Rejected");
    await expect(lender.page.getByRole("button", { name: `Accept offer from ${investorB.name}` })).toHaveCount(0);

    await investorB.page.reload();
    await expect(investorB.loanHeader()).toContainText("Sold");
    await expect(investorB.page.getByRole("row").filter({ hasText: "$395,000.00" })).toContainText("Rejected");
    await expect(investorB.page.getByRole("button", { name: "Withdraw offer" })).toHaveCount(0);

    const data = await lender.apiLoan(loanId);
    expect(data.offers.filter((o) => o.status === "accepted")).toHaveLength(1);
  });

  test("price limits, expiry and relisting: out-of-range offer is refused, an expired offer returns the loan to Listed, and the lender can then withdraw it", async ({
    lender,
    investorA,
  }) => {
    const loan = newLoan("expiry");
    const loanId = await lender.listLoan(loan);

    // Rule 1: just below 80% and just above 105% are refused with the reason; nothing is created.
    await investorA.openLoan(loanId);
    for (const price of [319_999.99, 420_000.01]) {
      await investorA.makeOffer(price);
      await expect(
        investorA.page.getByText("Offered price must be between $320,000.00 and $420,000.00"),
      ).toBeVisible();
    }
    await expect(investorA.loanHeader()).toContainText("Listed");
    expect((await lender.apiLoan(loanId)).offers).toHaveLength(0);

    // Exactly 80% is accepted (inclusive boundary) and moves the loan to Under Offer.
    await investorA.makeOffer(320_000);
    await expect(investorA.myOfferCard()).toContainText("Pending");
    await expect(investorA.loanHeader()).toContainText("Under Offer");

    // Rule 8: while the offer is active, the lender cannot withdraw the loan.
    await lender.openLoan(loanId);
    await lender.page.getByRole("button", { name: "Withdraw loan" }).click();
    await expect(lender.toast()).toContainText("Only listed loans can be withdrawn. This loan is under offer.");
    await expect(lender.loanHeader()).toContainText("Under Offer");

    // Rule 7: 48 hours pass — the offer expires and can no longer be acted on.
    await lender.gotoActivity();
    await lender.page.getByRole("button", { name: "Simulate time +48h" }).click();
    await expect(lender.toast()).toContainText(/offers? expired/);

    await lender.openLoan(loanId);
    await expect(lender.offerRow(investorA.name)).toContainText("Expired");
    await expect(lender.page.getByRole("button", { name: `Accept offer from ${investorA.name}` })).toHaveCount(0);
    // The loan lost its last active offer, so it is back to Listed.
    await expect(lender.loanHeader()).toContainText("Listed");

    // The investor sees the expiry and can make a fresh offer again.
    await investorA.page.reload();
    await expect(investorA.page.getByRole("row").filter({ hasText: "$320,000.00" })).toContainText("Expired");
    await expect(investorA.page.getByRole("button", { name: "Submit offer" })).toBeVisible();

    // Now the lender can withdraw it, and it leaves the marketplace.
    await lender.page.getByRole("button", { name: "Withdraw loan" }).click();
    await expect(lender.toast()).toContainText("Loan withdrawn from the marketplace.");
    await expect(lender.loanHeader()).toContainText("Withdrawn");

    await investorA.gotoMarketplace();
    await expect(investorA.marketplaceRow(loan.borrower)).toHaveCount(0);
  });
});
