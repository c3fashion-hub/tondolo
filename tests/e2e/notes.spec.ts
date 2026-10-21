import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PREVIEW_PORT } from "../../playwright.config.ts";

test.use({ baseURL: `http://localhost:${PREVIEW_PORT}` });
const axe = (page: Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();

// The phone's voice is stubbed so the tests can see what would be read aloud.
async function stubSpeech(page: Page) {
  await page.addInitScript(() => {
    const said: string[] = [];
    (window as unknown as { said: string[] }).said = said;
    class U { text: string; lang = ""; rate = 1; voice = null; onend: null | (() => void) = null; onerror = null; constructor(t: string) { this.text = t; } }
    (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = U;
    Object.defineProperty(window, "speechSynthesis", { value: {
      speak(u: U) { said.push(u.text); setTimeout(() => u.onend?.(), 5); },
      cancel() {}, pause() {}, resume() {}, getVoices() { return []; },
    } });
  });
}

test("\"Paid the florist 500 euros in cash\" suggests the right payment, saved only on confirm", async ({ page }) => {
  await page.goto("/dev/money?screen=notes");
  await expect(page.getByText("Photographer arrives at 13:00 for getting-ready shots")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Confirm the terrace or the lawn with the Quinta/ })).not.toBeChecked();
  await page.getByRole("button", { name: "Speak a note" }).click();
  await expect(page.getByRole("textbox", { name: "Your note" })).toBeFocused();
  await expect(page.getByText("Now tap the microphone on your keyboard and speak.")).toBeVisible(); // the tests run as a phone
  await page.getByRole("textbox", { name: "Your note" }).fill("Paid the florist 500 euros in cash");
  await page.getByRole("button", { name: "Suggest what to file" }).click();
  const option = page.getByRole("checkbox", { name: "Add a paid payment: Florist, €500, cash" });
  await expect(option).toBeChecked();
  await expect(page.getByText("We read this automatically. Check every amount and date before you save.")).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByRole("status")).toHaveText("Note saved, with 1 thing filed.");
  await expect(page.getByRole("listitem").filter({ hasText: "Paid the florist 500 euros in cash" })).toBeVisible();
});

test("the designed note files a payment, a booking detail and a reminder; each can be unticked", async ({ page }) => {
  await page.goto("/dev/money?screen=notes");
  await page.getByRole("textbox", { name: "Your note" }).fill("Paid Rita 150 euros in cash for the make-up trial today. The photographer says he'll arrive at 1. Remind me to send Rita our inspiration photos next week.");
  await page.getByRole("button", { name: "Suggest what to file" }).click();
  await expect(page.getByRole("checkbox", { name: "Add to Luz Studio's booking: arrives at 13:00" })).toBeChecked();
  await page.getByRole("checkbox", { name: "Add a paid payment: Hair and make-up trial, €150, cash" }).uncheck();
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByRole("status")).toHaveText("Note saved, with 2 things filed.");
  await expect(page.getByRole("checkbox", { name: /send Rita your inspiration photos/i })).toBeVisible();
});

test("the briefing shows this week and reads it aloud in the phone's voice", async ({ page }) => {
  await stubSpeech(page);
  await page.goto("/dev/money?screen=briefing");
  await expect(page.getByRole("heading", { name: "Four things need you this week" })).toBeVisible();
  await expect(page.getByText("Sunday check-in · 7pm")).toBeVisible();
  await expect(page.getByText("First, 3,360 euros to Sabores do Douro for the caterer's deposit, due on Friday. Mum is covering it.")).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
  await page.getByRole("button", { name: "Play the briefing" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { said: string[] }).said.length)).toBe(6);
  const said = await page.evaluate(() => (window as unknown as { said: string[] }).said);
  expect(said[0]).toBe("Hello Ade. 251 days to go.");
  expect(said[5]).toBe("And finally, ask Quinta do Rio to add a refund clause before your next payment.");
});

test("Ask a question answers from the wedding, shown and read aloud", async ({ page }) => {
  await stubSpeech(page);
  await page.goto("/dev/money?screen=overview");
  await expect(page.getByRole("link", { name: /Play this week.s briefing/ })).toBeVisible();
  await page.getByRole("button", { name: "Ask a question" }).click();
  const sheet = page.getByRole("dialog", { name: "Ask a question" });
  await sheet.getByLabel("Your question").fill("What do I still owe in euros?");
  await sheet.getByRole("button", { name: "Ask" }).click();
  await expect(sheet.getByText(/^You still owe €37,450 across 10 payments/)).toBeVisible();
  await expect(sheet.getByText("We read this automatically. Check every amount and date before you save.")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { said: string[] }).said.length)).toBe(1);
  expect((await axe(page)).violations).toEqual([]);
});

test("on a computer, Speak a note explains how to dictate or type", async ({ browser }) => {
  const computer = await browser.newContext({ hasTouch: false, isMobile: false, viewport: { width: 1280, height: 800 }, baseURL: `http://localhost:${PREVIEW_PORT}` });
  const page = await computer.newPage();
  await page.goto("/dev/money?screen=notes");
  await page.getByRole("button", { name: "Speak a note" }).click();
  await expect(page.getByText(/On a computer, type your note, or use dictation/)).toBeVisible();
  await computer.close();
});

test("notes and the briefing look right at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const screen of ["notes", "briefing"]) {
    await page.goto(`/dev/money?screen=${screen}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }
});
