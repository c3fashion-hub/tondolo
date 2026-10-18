import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PREVIEW_PORT } from "../../playwright.config.ts";

test.use({ baseURL: `http://localhost:${PREVIEW_PORT}` });
const axe = (page: Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();

test("Unlock shows the one price, tax included, in the couple's currency, with test mode clear", async ({ page }) => {
  await page.goto("/dev/money?screen=unlock");
  await expect(page.getByRole("heading", { name: "Take the sour out of wedding money" })).toBeVisible();
  await expect(page.getByText("You’ve used 3 of 5 free payments")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pay £49" })).toBeVisible();
  await expect(page.getByText(/Test mode\. No real money is taken/)).toBeVisible();
  await page.getByRole("radio", { name: "Euros (€55)" }).check();
  await expect(page.getByRole("button", { name: "Pay €55" })).toBeVisible();
  await page.getByRole("radio", { name: /Dollars/ }).check();
  await expect(page.getByRole("button", { name: /Pay US\$59/ })).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
});

test("Unlock fits a 320px phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/dev/money?screen=unlock");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
