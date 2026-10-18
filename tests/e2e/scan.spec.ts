import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PREVIEW_PORT } from "../../playwright.config.ts";

test.use({ baseURL: `http://localhost:${PREVIEW_PORT}` });
const axe = (page: Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();

test("the scan review shows what was read, flags IVA, and saves only what's ticked", async ({ page }) => {
  await page.goto("/dev/money?screen=scan");
  const sheet = page.getByRole("dialog", { name: "Check what we found" });
  await expect(sheet.getByText("In Portuguese · 2 payments found")).toBeVisible();
  await expect(sheet.getByLabel("Supplier")).toHaveValue("Quinta do Rio");
  await expect(sheet.getByLabel("Amount (EUR)").first()).toHaveValue("7800");
  await expect(sheet.getByText("This leaves out IVA at 23%, about €5,980.")).toBeVisible();
  await expect(sheet.getByText("We read this automatically. Check every amount and date before you save.")).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
  await sheet.getByRole("checkbox").first().uncheck();
  await expect(sheet.getByText("about €4,186")).toBeVisible(); // IVA on the balance alone
  await sheet.getByRole("button", { name: "Add 1 payment" }).click();
  await expect(page.getByRole("dialog", { name: "Scan documents" }).getByText("Added 1 payment.")).toBeVisible();
});

test("an amount that couldn't be read must be typed in before saving", async ({ page }) => {
  await page.goto("/dev/money?screen=scan");
  const sheet = page.getByRole("dialog", { name: "Check what we found" });
  await sheet.getByLabel("Amount (EUR)").first().fill("7.800,00 euros");
  await sheet.getByRole("button", { name: "Add 2 payments" }).click();
  await expect(sheet.getByRole("alert")).toContainText("Check the amount");
});

test("the contract check shows each must-have with its evidence, and can be corrected", async ({ page }) => {
  await page.goto("/dev/money?screen=contract");
  const sheet = page.getByRole("dialog", { name: "Check the contract" });
  await expect(sheet.getByText("2 of 3 must-haves need attention")).toBeVisible();
  await expect(sheet.getByText("A coordenação do evento será assegurada")).toBeVisible();
  await expect(sheet.getByText("The contract doesn't say you get your money back if the venue cancels.")).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
  await sheet.getByLabel("named people and substitutes: what the contract says").selectOption("present");
  await expect(sheet.getByText("1 of 3 must-haves need attention")).toBeVisible();
  await sheet.getByRole("button", { name: "Save the contract check" }).click();
  await expect(page.getByRole("dialog", { name: "Check a contract" }).getByText("Contract check saved.")).toBeVisible();
});

test("Payments offers scanning to the couple", async ({ page }) => {
  await page.goto("/dev/money");
  await expect(page.getByRole("button", { name: "Scan a document" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check a contract" })).toBeVisible();
});
