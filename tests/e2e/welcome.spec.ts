import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function fillValid(page: Page) {
  await page.getByLabel("Wedding date").fill("2027-06-26");
  await page.getByLabel("Where are you getting married?").fill("Porto, Portugal");
  await page.getByLabel("Which currency do you pay from?").selectOption("GBP");
  await page.getByLabel("Your names (optional)").fill("Ade & Sam");
  await page.getByLabel("Rough total budget (optional)").fill("58,000");
}

test("shows the welcome and setup screen as designed", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Tondolo");
  await expect(page.getByText("tondolo", { exact: true })).toBeVisible();
  await expect(page.getByText("Take the sour out of wedding money.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Let’s set up your wedding" })).toBeVisible();
  await expect(page.getByText("A few quick questions, then add your first quote or invoice.")).toBeVisible();
  for (const label of ["Wedding date", "Where are you getting married?", "Which currency do you pay from?", "Your names (optional)", "Rough total budget (optional)"]) {
    await expect(page.getByLabel(label)).toBeVisible();
  }
  await expect(page.getByLabel("Which currency do you pay from?")).toHaveValue("GBP");
  await expect(page.getByRole("checkbox")).toBeChecked();
  await expect(page.getByRole("button", { name: "Start my budget" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore an example wedding" })).toBeVisible();
  await expect(page.getByText("Tondolo helps you organise your wedding money. Always check amounts, dates and details against your contracts, invoices and bank statements before you pay.")).toBeVisible();
});

test("asks for what's missing and moves focus to it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start my budget" }).click();
  await expect(page.getByText("Add your wedding date.")).toBeVisible();
  await expect(page.getByText("Add where you're getting married.")).toBeVisible();
  await expect(page.getByLabel("Wedding date")).toBeFocused();
  await expect(page.getByLabel("Wedding date")).toHaveAttribute("aria-invalid", "true");
});

test("rejects a budget that isn't an amount", async ({ page }) => {
  await page.goto("/");
  await fillValid(page);
  await page.getByLabel("Rough total budget (optional)").fill("lots");
  await page.getByRole("button", { name: "Start my budget" }).click();
  await expect(page.getByText("Enter an amount, like 40,000, or leave it blank.")).toBeVisible();
  await expect(page).toHaveURL("/");
});

test("asks for an email to save the wedding", async ({ page }) => {
  await page.goto("/");
  await fillValid(page);
  await page.getByRole("button", { name: "Start my budget" }).click();
  await expect(page).toHaveURL("/save");
  await expect(page.getByRole("heading", { level: 1, name: "Save your wedding" })).toBeVisible();
  await expect(page.getByLabel("Your email")).toBeVisible();
  const draft = await page.evaluate(() => localStorage.getItem("tondolo.setupDraft.v1"));
  expect(JSON.parse(draft!)).toMatchObject({ weddingDate: "2027-06-26", destination: "Porto, Portugal", names: "Ade & Sam", roughBudgetMinor: 5_800_000 });
});

test("offers sign-in to people who already use Tondolo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/sign-in");
});

test("fits a 320px-wide phone without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("every control is at least 44px tall", async ({ page }) => {
  await page.goto("/");
  const small = await page.$$eval("button, a.tn-btn, input:not([type=checkbox]), select", (els) =>
    els.map((el) => ({ el: el.outerHTML.slice(0, 60), h: el.getBoundingClientRect().height })).filter((x) => x.h < 44));
  expect(small).toEqual([]);
});

for (const scheme of ["light", "dark"] as const) {
  test(`has no accessibility problems in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await page.getByRole("button", { name: "Start my budget" }).click();
    const withErrors = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(withErrors.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}

test("can be added to the home screen", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBeTruthy();
  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({ name: "Tondolo", display: "standalone", start_url: "/" });
  for (const icon of manifest.icons) {
    const res = await request.get(icon.src);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  }
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});
