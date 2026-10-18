import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const SHOTS = process.env.E2E_SHOTS;

async function noViolations(page: import("@playwright/test").Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  // Stand in for Supabase's "email sent" reply so the screens can be checked without sending email.
  await page.route("**/auth/v1/otp**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
});

test("sign-in asks for an email, then a code", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  await noViolations(page);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/sign-in-email.png`, fullPage: true });

  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await expect(page.getByText("Enter your email address, like name@example.com.")).toBeVisible();

  await page.getByLabel("Your email").fill("Ade@Example.com");
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await expect(page.getByText("We’ve emailed ade@example.com")).toBeVisible();
  await expect(page.getByLabel("Code from the email")).toBeFocused();
  await noViolations(page);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/sign-in-code.png`, fullPage: true });

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter the code from the email.")).toBeVisible();
  await page.getByRole("button", { name: "Use a different email" }).click();
  await expect(page.getByLabel("Your email")).toBeVisible();
});

test("an expired email link explains what to do", async ({ page }) => {
  await page.goto("/sign-in?error=link");
  await expect(page.getByRole("alert").filter({ hasText: "That sign-in link has expired or was already used." })).toBeVisible();
});

test("saving a wedding asks for an email, then a code", async ({ page }) => {
  await page.goto("/save");
  await expect(page.getByRole("heading", { level: 1, name: "Save your wedding" })).toBeVisible();
  await noViolations(page);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/save-email.png`, fullPage: true });
  await page.getByLabel("Your email").fill("ade@example.com");
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await expect(page.getByLabel("Code from the email")).toBeVisible();
});

test("a wedding page needs signing in", async ({ page }) => {
  await page.goto("/w/00000000-0000-4000-8000-000000000000");
  await expect(page).toHaveURL("/sign-in");
});

test("the local preview page isn't served on the live site", async ({ page }) => {
  const res = await page.goto("/dev/money");
  expect(res?.status()).toBe(404);
});
