import { type Browser, expect, type Locator, type Page, test as base } from "@playwright/test";

/**
 * The app has no test ids, so every locator goes through what a user sees: roles, labels,
 * button names and the aria-labels the app already has (e.g. "Accept offer from Marcus Chen").
 */

export const USERS = {
  lender: { card: "Lender – Dana Whitfield", name: "Dana Whitfield" },
  investorA: { card: "Investor A – Marcus Chen", name: "Marcus Chen" },
  investorB: { card: "Investor B – Priya Raman", name: "Priya Raman" },
} as const;

type UserKey = keyof typeof USERS;

export interface NewLoan {
  borrower: string;
  city: string;
  amount: number;
  rate: number;
  askingPrice: number;
}

/** One signed-in user in their own browser context, so several users can act side by side. */
export class MiniLendUser {
  readonly name: string;

  constructor(
    readonly page: Page,
    private readonly key: UserKey,
  ) {
    this.name = USERS[key].name;
  }

  async signIn(): Promise<void> {
    await this.page.goto("/login");
    await this.page.getByRole("button", { name: USERS[this.key].card }).click();
    await this.page.getByRole("button", { name: "Sign in" }).click();
    await expect(this.page.getByRole("heading", { name: "Marketplace" })).toBeVisible();
    await expect(this.page.getByRole("button", { name: `Account menu for ${this.name}` })).toBeVisible();
  }

  toast(): Locator {
    return this.page.locator(".v-snackbar");
  }

  // ---------- Marketplace ----------

  async gotoMarketplace(): Promise<void> {
    await this.page.goto("/marketplace");
    await expect(this.page.getByRole("heading", { name: "Marketplace" })).toBeVisible();
  }

  marketplaceRow(borrower: string): Locator {
    return this.page.getByRole("row").filter({ hasText: borrower });
  }

  /** Lender: lists a loan through the "List a new loan" form and returns its id. */
  async listLoan(loan: NewLoan): Promise<number> {
    await this.gotoMarketplace();
    await this.page.getByRole("button", { name: "List a new loan" }).click();
    const dialog = this.page.getByRole("dialog");
    await dialog.getByLabel("Borrower name").fill(loan.borrower);
    await dialog.getByLabel("Property city").fill(loan.city);
    await dialog.getByLabel("Loan amount").fill(String(loan.amount));
    await dialog.getByLabel("Interest rate").fill(String(loan.rate));
    await dialog.getByLabel("Asking price").fill(String(loan.askingPrice));
    // After a create the page re-fetches the table; wait for it so the row link isn't clicked mid re-render.
    const tableReloaded = this.page.waitForResponse(
      (r) => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/loans",
    );
    await dialog.getByRole("button", { name: "List loan" }).click();
    await tableReloaded;
    await expect(dialog).toBeHidden();

    await expect(this.toast()).toContainText(`Loan for ${loan.borrower} is now listed.`);
    await expect(this.marketplaceRow(loan.borrower)).toContainText("Listed");

    await this.page.getByRole("link", { name: loan.borrower }).click();
    await expect(this.page).toHaveURL(/\/loans\/\d+$/);
    return Number(this.page.url().split("/").pop());
  }

  // ---------- Loan details ----------

  async openLoan(loanId: number): Promise<void> {
    await this.page.goto(`/loans/${loanId}`);
    await expect(this.page.getByRole("heading", { level: 1, name: new RegExp(`^Loan #${loanId} `) })).toBeVisible();
  }

  /** The header row of the loan page: title plus the loan status chip. */
  loanHeader(): Locator {
    return this.page.getByRole("heading", { level: 1 }).locator("..");
  }

  async makeOffer(price: number): Promise<void> {
    await this.page.getByLabel("Offered price").fill(String(price));
    await this.page.getByRole("button", { name: "Submit offer" }).click();
  }

  /** Investor: the "Your offer" card for their active offer. */
  myOfferCard(): Locator {
    return this.page.getByRole("heading", { name: "Your offer" }).locator("../..");
  }

  /** Lender: the row for one investor in the loan's offers table. */
  offerRow(investorName: string): Locator {
    return this.page.getByRole("row").filter({ hasText: investorName });
  }

  async counterOffer(investorName: string, counterPrice: number): Promise<void> {
    await this.page.getByRole("button", { name: `Counter offer from ${investorName}` }).click();
    const dialog = this.page.getByRole("dialog");
    await dialog.getByLabel("Counter price").fill(String(counterPrice));
    await dialog.getByRole("button", { name: "Send counter" }).click();
    await expect(dialog).toBeHidden();
  }

  // ---------- My Activity ----------

  async gotoActivity(): Promise<void> {
    await this.page.goto("/activity");
    await expect(this.page.getByRole("heading", { name: "My Activity" })).toBeVisible();
  }

  /** Lender: the number on one of the Listed / Under offer / Sold summary tiles. */
  async summaryCount(label: "Listed" | "Under offer" | "Sold"): Promise<number> {
    const tile = this.page.getByLabel("Loan summary").getByText(label, { exact: true }).locator("..");
    await expect(tile).toHaveText(new RegExp(`${label}\\s*\\d+`));
    return Number((await tile.innerText()).replace(/\D/g, ""));
  }

  // ---------- Data level (same session cookie, straight to the API) ----------

  async apiLoan(loanId: number): Promise<{
    loan: { status: string };
    offers: { investor_name: string; offered_price: number; counter_price: number | null; status: string }[];
  }> {
    const response = await this.page.request.get(`/api/loans/${loanId}`);
    expect(response.ok()).toBeTruthy();
    return response.json();
  }
}

async function signedIn(browser: Browser, key: UserKey, use: (user: MiniLendUser) => Promise<void>) {
  const context = await browser.newContext();
  const user = new MiniLendUser(await context.newPage(), key);
  await user.signIn();
  await use(user);
  await context.close();
}

export const test = base.extend<{ lender: MiniLendUser; investorA: MiniLendUser; investorB: MiniLendUser }>({
  lender: async ({ browser }, use) => signedIn(browser, "lender", use),
  investorA: async ({ browser }, use) => signedIn(browser, "investorA", use),
  investorB: async ({ browser }, use) => signedIn(browser, "investorB", use),
});

export { expect };

/** A fresh loan per test, so tests never depend on the seed data or on each other. */
export function newLoan(label: string): NewLoan {
  return {
    borrower: `QA ${label} ${Date.now().toString(36)}`,
    city: "Austin, TX",
    amount: 400000,
    rate: 6.5,
    askingPrice: 400000, // offer range is therefore $320,000 – $420,000
  };
}
