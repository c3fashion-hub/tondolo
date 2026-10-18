import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PREVIEW_PORT } from "../../playwright.config.ts";

test.use({ baseURL: `http://localhost:${PREVIEW_PORT}` });

// The example wedding, as approved in the spec: score 71 and the same findings.
test("Overview shows what needs attention, the score and the budget summary", async ({ page }) => {
  await page.goto("/dev/money?screen=overview");
  await expect(page.getByText("251")).toBeVisible();
  await expect(page.getByText("Caterer – deposit 30%")).toBeVisible();
  await expect(page.getByText("Due in 5 days")).toBeVisible();
  await expect(page.getByText("£2,890 today")).toBeVisible();
  await expect(page.getByText("£7,000 at risk")).toBeVisible();
  await expect(page.getByText("1 must-have missing, 1 incomplete. Fix it before your next payment.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Money health check: 71 of 100.*Fix the first two and you'll be at 92/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /£41,578 of £58,000 committed.*A 5% rate move would add £1,610\. £346 lost to fees\./ })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("the health check lists the four issues in order, then what's going well", async ({ page }) => {
  await page.goto("/dev/money?screen=health");
  await expect(page.getByRole("heading", { level: 1, name: "Money health check" })).toBeVisible();
  await expect(page.getByText("71 of 100: A few gaps to close.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 3 })).toHaveText([
    "Quinta do Rio: £7,000 at risk",
    "About €5,980 of IVA isn't in your totals",
    "3 costs missing from your budget",
    "DJ and sound – deposit is still an estimate",
  ]);
  await expect(page.getByText("£2,371 of £9,371 paid is covered")).toBeVisible();
  await expect(page.getByText(/\b(safe|protected)\b/i)).toHaveCount(0);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("Payments shows each supplier's protection level", async ({ page }) => {
  await page.goto("/dev/money");
  const suppliers = page.getByRole("region", { name: "Your suppliers" });
  await expect(suppliers.getByText("Level 1 · Contract: 1 must-have missing, 1 incomplete")).toBeVisible();
  await expect(suppliers.getByText("Level 2 · Booking confirmed in writing · Arrives 13:00")).toBeVisible();
  await expect(suppliers.getByText("In place")).toHaveCount(5);
});

test("First open asks for the first payment, with no score yet", async ({ page }) => {
  await page.goto("/dev/money?screen=first");
  await expect(page.getByRole("heading", { name: "Add your first payment" })).toBeVisible();
  await expect(page.getByText(/Money health check/)).toHaveCount(0);
  await expect(page.getByText("committed")).toHaveCount(0);
});
