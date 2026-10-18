import { test, expect, type Browser } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./session.ts";

// Runs against the real Supabase project with temporary test people. Run with: npm run test:live
test.describe.configure({ mode: "serial" });
const SHOTS = process.env.E2E_SHOTS;

async function personPage(browser: Browser, email: string, baseURL: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-GB", timezoneId: "Europe/London" });
  await signIn(context, email, baseURL);
  return context.newPage();
}

async function axe(page: import("@playwright/test").Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.help} (${v.nodes[0]?.target})`)).toEqual([]);
}

let weddingUrl = "";
let partnerLink = "";
let mumLink = "";
let plannerLink = "";

test("the owner sets up and saves a wedding", async ({ browser, baseURL }) => {
  const page = await personPage(browser, "e2e-owner@example.com", baseURL!);
  await page.goto("/");
  await page.getByLabel("Wedding date").fill("2027-06-26");
  await page.getByLabel("Where are you getting married?").fill("Porto, Portugal");
  await page.getByLabel("Your names (optional)").fill("Ade & Sam");
  await page.getByRole("button", { name: "Start my budget" }).click();
  await page.waitForURL(/\/w\/[0-9a-f-]{36}$/);
  weddingUrl = new URL(page.url()).pathname;
  await expect(page.getByText("Ade & Sam · Porto, Portugal · Sat 26 Jun 2027")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add your first payment" })).toBeVisible();
  for (const tab of ["Overview", "Payments", "Budget", "Notes", "Settings"]) await expect(page.getByRole("link", { name: tab })).toBeVisible();
  await axe(page);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/overview.png`, fullPage: true });
});

test("the owner invites a partner, family member and planner", async ({ browser, baseURL }) => {
  const page = await personPage(browser, "e2e-owner@example.com", baseURL!);
  await page.goto(`${weddingUrl}/settings`);
  await expect(page.getByText("Ade (you)")).toBeVisible();
  await axe(page);

  async function invite(name: string, email: string, role: "Partner" | "Planner" | "Family") {
    await page.getByRole("button", { name: "Invite someone" }).click();
    const sheet = page.getByRole("dialog", { name: "Invite someone" });
    await sheet.getByLabel("Their name").fill(name);
    await sheet.getByLabel("Their email").fill(email);
    await sheet.getByRole("radio", { name: new RegExp(`^${role}`) }).check();
    if (SHOTS && role === "Family") await page.screenshot({ path: `${SHOTS}/invite-form.png` });
    await sheet.getByRole("button", { name: "Make an invite link" }).click();
    const share = page.getByRole("dialog", { name: "Send your invite" });
    const link = (await share.getByLabel("Invite link").textContent())!.trim();
    expect(link).toMatch(/\/invite\/[0-9a-f]{48}$/);
    await expect(share.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", /wa\.me/);
    if (SHOTS && role === "Partner") await page.screenshot({ path: `${SHOTS}/invite-share.png` });
    await share.getByRole("button", { name: "Done" }).click();
    return new URL(link).pathname;
  }

  partnerLink = await invite("Sam", "e2e-partner@example.com", "Partner");
  mumLink = await invite("Mum", "e2e-mum@example.com", "Family");
  plannerLink = await invite("Magali", "e2e-planner-not-a-user@example.com", "Planner");
  await expect(page.getByText("Invited")).toHaveCount(3);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/settings.png`, fullPage: true });
});

test("an invite link shows who it's for before signing in", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(partnerLink);
  await expect(page.getByRole("heading", { name: "You’re invited, Sam" })).toBeVisible();
  await expect(page.getByText("Ade has invited you to Ade & Sam’s wedding in Porto, Portugal")).toBeVisible();
  await expect(page.getByText("You’ll join as the partner")).toBeVisible();
  await expect(page.getByLabel("Your email")).toBeVisible();
  await axe(page);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/invite-signed-out.png`, fullPage: true });
});

test("a link alone gives no access", async ({ browser, baseURL }) => {
  const page = await personPage(browser, "e2e-stranger@example.com", baseURL!);
  await page.goto(plannerLink);
  await page.getByRole("button", { name: "Join the wedding" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This invite was sent to e•••@example.com" })).toBeVisible();
  const res = await page.goto(weddingUrl);
  expect(res?.status()).toBe(404);
});

test("the partner joins and can see the wedding", async ({ browser, baseURL }) => {
  const page = await personPage(browser, "e2e-partner@example.com", baseURL!);
  await page.goto(partnerLink);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/invite-signed-in.png`, fullPage: true });
  await page.getByRole("button", { name: "Join the wedding" }).click();
  await page.waitForURL(weddingUrl);
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByText("Sam (you)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Invite someone" })).toBeVisible();
});

test("the used link stops working", async ({ page }) => {
  await page.goto(partnerLink);
  await expect(page.getByRole("heading", { name: "This invite has expired" })).toBeVisible();
});

test("Mum joins as family and sees only what family may see", async ({ browser, baseURL }) => {
  const page = await personPage(browser, "e2e-mum@example.com", baseURL!);
  await page.goto(mumLink);
  await page.getByRole("button", { name: "Join the wedding" }).click();
  await page.waitForURL(weddingUrl);
  await expect(page.getByRole("link", { name: "Budget" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Notes" })).toHaveCount(0);
  expect((await page.goto(`${weddingUrl}/notes`))?.status()).toBe(404);
  expect((await page.goto(`${weddingUrl}/budget`))?.status()).toBe(404);
  await page.goto(`${weddingUrl}/settings`);
  await expect(page.getByText("Mum (you)")).toBeVisible();
  await expect(page.getByText("Ade (you)")).toHaveCount(0);
  await expect(page.locator("li")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Invite someone" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit your wedding" })).toHaveCount(0);
});

test("the partner removes Mum and she loses access straight away", async ({ browser, baseURL }) => {
  const page = await personPage(browser, "e2e-partner@example.com", baseURL!);
  await page.goto(`${weddingUrl}/settings`);
  await page.getByRole("button", { name: "Change Mum" }).click();
  await page.getByRole("button", { name: "Remove from your wedding" }).click();
  await page.getByRole("button", { name: "Remove Mum" }).click();
  await expect(page.getByText("Mum", { exact: true })).toHaveCount(0);
  const mum = await personPage(browser, "e2e-mum@example.com", baseURL!);
  expect((await mum.goto(weddingUrl))?.status()).toBe(404);
});

test("sign-in screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Supabase can't email made-up addresses, so stand in for its reply.
  await page.route("**/auth/v1/otp**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await axe(page);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/sign-in-email.png`, fullPage: true });
  await page.getByLabel("Your email").fill("ade@example.com");
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await expect(page.getByText("We’ve emailed ade@example.com")).toBeVisible();
  await expect(page.getByLabel("Code from the email")).toBeFocused();
  await axe(page);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/sign-in-code.png`, fullPage: true });
});
