import { expect, test } from "@playwright/test";
import { LandingPage } from "../pages/LandingPage";

test.describe("Landing Page", () => {
  let lp: LandingPage;

  test.beforeEach(async ({ page }) => {
    lp = new LandingPage(page);
    await lp.goto();
  });

  test("hero shows key value proposition", async ({ page }) => {
    await expect(lp.heroTitle).toContainText("From rubrics to exams");
    await expect(lp.heroSubtitle).toBeVisible();
    await expect(page.getByText("Trusted by 2,000+ AP teachers worldwide")).toBeVisible();
  });

  test("desktop nav links are visible", async ({ page }) => {
    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link", { name: "Features" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Pricing" }).first()).toBeVisible();
    await expect(nav.getByRole("link", { name: "About" }).first()).toBeVisible();
    await expect(nav.getByRole("link", { name: "Blog" }).first()).toBeVisible();
  });

  test("feature showcase renders all four capabilities", async ({ page }) => {
    await expect(lp.featureSection).toBeVisible();
    await expect(page.getByText("AI Rubric Generation")).toBeVisible();
    await expect(page.getByText("Smart Worksheet Builder")).toBeVisible();
    await expect(page.getByText("Exam Assembly")).toBeVisible();
    await expect(page.getByText("One-Click Export")).toBeVisible();
  });

  test("cta banner can submit email", async ({ page }) => {
    await lp.ctaEmailInput.scrollIntoViewIfNeeded();
    await lp.ctaEmailInput.fill("teacher@example.com");
    await page.getByRole("button", { name: "Join Waitlist" }).click();
    await expect(page.getByText("You're on the list! We'll be in touch soon.")).toBeVisible();
  });

  test("language toggle switches to Chinese copy", async ({ page }) => {
    await lp.switchToChinese();
    await expect(page.getByText("AP 教师的 AI 副驾驶。通过一次对话即可生成评分标准、练习题和考试。")).toBeVisible();
  });

  test("footer keeps key links and brand", async ({ page }) => {
    const footer = page.getByRole("contentinfo");
    await footer.scrollIntoViewIfNeeded();
    await expect(footer.getByRole("link", { name: /E\s*Deskmate/ })).toBeVisible();
    await expect(footer.getByRole("link", { name: "Privacy" }).first()).toBeVisible();
    await expect(footer.getByRole("link", { name: "Terms" }).first()).toBeVisible();
  });
});
