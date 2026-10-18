import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PREVIEW_PORT } from "../../playwright.config.ts";

test.use({ baseURL: `http://localhost:${PREVIEW_PORT}` });
const axe = (page: Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();

test("Settings shows the check-in with calendar links, and each person's own emails", async ({ page }) => {
  await page.goto("/dev/money?screen=settings");
  await expect(page.getByText("Weekly check-in · Sundays 7pm, plus Wednesdays in the final six weeks")).toBeVisible();
  await expect(page.getByRole("link", { name: "Apple or Outlook" })).toHaveAttribute("href", "/w/example/calendar/checkin");
  const google = await page.getByRole("link", { name: "Google (weekly)" }).getAttribute("href");
  expect(new URL(google!).searchParams.get("recur")).toBe("RRULE:FREQ=WEEKLY;BYDAY=SU;UNTIL=20270626T235959Z");
  await expect(page.getByRole("checkbox", { name: /Payment reminders/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /Weekly summary/ })).not.toBeChecked();
  await page.getByRole("button", { name: "Send me a test reminder" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Sent to ade@example.com" })).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
});

test("the check-in sheet offers a second day for the final six weeks", async ({ page }) => {
  await page.goto("/dev/money?screen=settings");
  await page.getByRole("button", { name: "Change the weekly check-in" }).click();
  const sheet = page.getByRole("dialog", { name: "Weekly check-in" });
  await expect(sheet.getByLabel("Day", { exact: true })).toHaveValue("7");
  await expect(sheet.getByLabel("Second day")).toHaveValue("3");
  await sheet.getByRole("checkbox", { name: "Twice a week in the final six weeks" }).uncheck();
  await expect(sheet.getByLabel("Second day")).toHaveCount(0);
  expect((await axe(page)).violations).toEqual([]);
});
