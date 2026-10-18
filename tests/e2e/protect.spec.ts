import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PREVIEW_PORT } from "../../playwright.config.ts";

test.use({ baseURL: `http://localhost:${PREVIEW_PORT}` });
const axe = (page: Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();

test("a booking confirmation opens in WhatsApp in French", async ({ page }) => {
  await page.goto("/dev/money?screen=supplier&id=s-rita");
  await page.getByRole("button", { name: "Send a new booking message" }).click();
  await page.getByRole("button", { name: "Français" }).click();
  await expect(page.getByRole("button", { name: "Français" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("1. Who").fill("Rita, plus une assistante");
  await page.getByLabel("2. What").fill("coiffure et maquillage");
  await page.getByLabel("Arrives at").fill("08:30");
  await page.getByLabel("Everything ready by").fill("12:30");
  const whatsapp = page.getByRole("link", { name: "Send on WhatsApp" });
  const url = new URL((await whatsapp.getAttribute("href"))!);
  expect(url.origin + url.pathname).toBe("https://wa.me/351912000000");
  const text = url.searchParams.get("text")!;
  expect(text).toContain("Bonjour Rita, nous sommes ravis de vous réserver pour notre mariage !");
  expect(text).toContain("Heure d'arrivée et installation terminée : arrivée à 08h30, installation terminée à 12h30");
  expect(text).toContain("Un simple « Confirmé » nous suffit. Merci beaucoup !");
  expect(await whatsapp.getAttribute("target")).toBe("_blank");
  expect(await page.getByRole("link", { name: "Send by email" }).getAttribute("href")).toMatch(/^mailto:\?subject=Notre%20r%C3%A9servation/);
  expect((await axe(page)).violations).toEqual([]);
});

test("the cash plan matches the on-the-day payments", async ({ page }) => {
  await page.goto("/dev/money?screen=cash");
  const total = page.getByRole("region", { name: "Total to withdraw" });
  await expect(total).toContainText("€2,100");
  await expect(total).toContainText("24 Jun 2027");
  const items = page.locator("ol > li");
  await expect(items).toHaveCount(4);
  await expect(items.nth(0)).toContainText("Hair and make-up – balance");
  await expect(items.nth(0)).toContainText("09:00 · Sam's sister hands over");
  await expect(items.nth(2)).toContainText("16:30, after the ceremony · Best man hands over");
  await expect(items.nth(3)).toContainText("End of the night · Best man hands over");
  await expect(page.getByRole("button", { name: "Print envelopes" })).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
});

test("Pay this safely gives the Kit's advice and leads to marking it paid", async ({ page }) => {
  await page.goto("/dev/money");
  await page.getByRole("button", { name: "Pay this safely: Caterer – deposit 30%" }).click();
  const sheet = page.getByRole("dialog", { name: "Pay this safely" });
  await expect(sheet.getByRole("heading", { name: "Pay by credit card, in euros" })).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "Always pay in euros" })).toBeVisible();
  await expect(sheet.getByText("General information, not legal or financial advice.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Copy receipt request in Portuguese" })).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
  await sheet.getByRole("button", { name: "I’ve paid it" }).click();
  await expect(page.getByRole("dialog", { name: "Mark as paid" })).toBeVisible();
});

test("a Level 1 supplier gets contract advice, never a booking message", async ({ page }) => {
  await page.goto("/dev/money?screen=supplier&id=s-quinta");
  await expect(page.getByText("1 must-have missing, 1 incomplete. Ask Quinta do Rio to add them before your next payment.")).toBeVisible();
  await expect(page.getByRole("button", { name: /booking/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Download the claim pack (PDF)" })).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
});
