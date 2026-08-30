import { test, expect, type Page } from "@playwright/test";

/** Click a CTA and report where it took us. */
const clickCta = async (page: Page, name: string | RegExp, which: "first" | "last" = "first") => {
  const link = page.getByRole("link", { name })[which]();
  await expect(link, `CTA "${name}" should be on the page`).toBeVisible();
  await link.scrollIntoViewIfNeeded();
  await link.click();
  await page.waitForURL(/\/(apply|login)$/, { timeout: 10_000 });
  return new URL(page.url()).pathname;
};

test.describe("landing page", () => {
  test("every call-to-action navigates somewhere", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Veya/);

    await expect(await clickCta(page, /Start Application/i), "hero CTA").toBe("/apply");

    await page.goto("/");
    await expect(await clickCta(page, /Apply Now/i), "navbar CTA").toBe("/apply");

    await page.goto("/");
    await expect(await clickCta(page, /Apply Now/i, "last"), "bottom CTA").toBe("/apply");

    await page.goto("/");
    await expect(await clickCta(page, /Sign In/i), "navbar sign-in").toBe("/login");
  });

  test("navbar anchors all point at real sections", async ({ page }) => {
    await page.goto("/");
    const anchors = await page.locator('nav a[href^="#"]').evaluateAll((els) =>
      els.map((e) => (e as HTMLAnchorElement).getAttribute("href")!),
    );
    expect(anchors.length).toBeGreaterThan(0);
    for (const href of anchors) {
      const count = await page.locator(`[id="${href.slice(1)}"]`).count();
      expect(count, `${href} should match a section on the page`).toBeGreaterThan(0);
    }
  });

  test("the in-page 'Explore Programs' anchor scrolls to the programs section", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Explore Programs/i }).click();
    await expect(page.locator("#programs")).toBeInViewport({ timeout: 5000 });
  });
});

test.describe("applying", () => {
  test("a visitor can submit an application without an account", async ({ page }) => {
    const email = `applicant-${Date.now()}@example.com`;

    await page.goto("/");
    await page.getByRole("link", { name: /Start Application/i }).click();
    await expect(page).toHaveURL(/\/apply$/);

    await page.getByLabel("Full name").fill("Test Applicant");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel(/Phone/i).fill("+233200000000");

    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "Digital Arts" }).click();

    await page.getByLabel(/Why this programme/i).fill("Submitted by the Playwright suite.");
    await page.getByRole("button", { name: /Submit application/i }).click();

    await expect(page.getByText(/Application received/i)).toBeVisible({ timeout: 15000 });
  });

  test("the form refuses an invalid email", async ({ page }) => {
    await page.goto("/apply");
    await page.getByLabel("Full name").fill("Test Applicant");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: /Submit application/i }).click();
    await expect(page.getByText(/valid email address/i)).toBeVisible();
  });
});

test("the login page is reachable and renders a form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /sign in|log ?in/i }).first()).toBeVisible();
});
