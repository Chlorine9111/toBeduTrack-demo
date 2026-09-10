import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = process.env.UX_BASE_URL ?? "https://www.deskmate.pro";
const loginEmail =
  process.env.UX_LOGIN_EMAIL ?? "teacher.onboarding.1772888667431@example.com";
const loginPassword = process.env.UX_LOGIN_PASSWORD ?? "Teacher123A";
const artifactDir = process.argv[2] ?? "output/playwright/debug-prod-login";

await fs.mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1024 },
  acceptDownloads: false,
});
const page = await context.newPage();

const consoleErrors = [];
const pageErrors = [];
const apiEvents = [];

page.on("console", (message) => {
  if (message.type() !== "error") return;
  consoleErrors.push({
    text: message.text(),
    location: message.location(),
  });
});

page.on("pageerror", (error) => {
  pageErrors.push({
    message: error.message,
    stack: error.stack ?? null,
  });
});

page.on("response", (response) => {
  const url = response.url();
  if (
    url.includes("/api/") ||
    url.includes("/auth/") ||
    url.includes("supabase.co/auth") ||
    url.includes("supabase.co/rest")
  ) {
    apiEvents.push({
      url,
      status: response.status(),
      type: response.request().resourceType(),
      method: response.request().method(),
    });
  }
});

try {
  await page.goto(`${baseUrl}/auth/login`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.locator('form[data-auth-ready="true"]').waitFor({
    state: "visible",
    timeout: 30000,
  });
  await page.locator("#login-email").fill(loginEmail);
  await page.locator("#login-password").fill(loginPassword);
  await page.screenshot({
    path: path.join(artifactDir, "before-click.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: /^登录$/ }).click();
  await page.waitForTimeout(12000);

  await page.screenshot({
    path: path.join(artifactDir, "after-click.png"),
    fullPage: true,
  });

  const bodyText = (await page.locator("body").innerText()).slice(0, 5000);
  const cookies = await context.cookies();

  console.log(
    JSON.stringify(
      {
        finalUrl: page.url(),
        title: await page.title(),
        bodyText,
        consoleErrors,
        pageErrors,
        apiEvents: apiEvents.slice(-80),
        cookies: cookies.map((cookie) => ({
          name: cookie.name,
          domain: cookie.domain,
          expires: cookie.expires,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
