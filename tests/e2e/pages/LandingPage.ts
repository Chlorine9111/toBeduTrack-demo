import { expect, type Locator, type Page } from "@playwright/test";

export class LandingPage {
  readonly page: Page;
  readonly heroTitle: Locator;
  readonly heroSubtitle: Locator;
  readonly featureSection: Locator;
  readonly ctaEmailInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heroTitle = page.getByRole("heading", { level: 1 }).first();
    this.heroSubtitle = page.getByText(
      "The AI co-pilot for AP teachers. Generate rubrics, worksheets, and exams with a single conversation.",
    );
    this.featureSection = page.locator("#features");
    this.ctaEmailInput = page.getByPlaceholder("Enter your school email");
  }

  async goto() {
    await this.page.goto("/", { waitUntil: "networkidle" });
    await expect(this.heroTitle).toBeVisible();
  }

  async switchToChinese() {
    await this.page.getByRole("button", { name: "切换到中文" }).click();
    await expect(this.page.getByRole("heading", { level: 1, name: /从评分标准到考试/ })).toBeVisible();
  }
}
