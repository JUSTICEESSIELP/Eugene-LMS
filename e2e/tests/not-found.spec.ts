import { test, expect } from "@playwright/test";

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

const DEVELOPER_SCREEN = /Unexpected Application Error|Hey developer|errorElement/i;

test("unknown URLs never show React Router's developer screen", async ({ page }) => {
  for (const path of ["/nope", "/attendance", "/finance/fees", "/lms/materials"]) {
    await page.goto(path);
    await page.waitForTimeout(700);
    const body = await page.locator("body").innerText();
    expect(body, `${path} still shows the raw error screen`).not.toMatch(DEVELOPER_SCREEN);
  }
});

test("a mistyped URL gets a 404 with a way back", async ({ page }) => {
  await page.goto("/definitely-not-a-page");
  await expect(page.getByText(/can't find that page/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /back to homepage/i })).toBeVisible();
  await page.getByRole("link", { name: /back to homepage/i }).click();
  await expect(page).toHaveURL(/\/$/);
});

test.describe("signed in", () => {
  test.skip(!email || !password, "ADMIN_EMAIL / ADMIN_PASSWORD not set");

  test("unbuilt features say so, and keep the sidebar", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(email!);
    await page.getByLabel(/password/i).fill(password!);
    await page.getByRole("button", { name: /sign in/i }).first().click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });

    await page.goto("/attendance");
    await expect(page.getByText(/Attendance isn't built yet/i)).toBeVisible();
    // The sidebar has to survive, or the only way out is the back button.
    // Its items render as buttons, so assert on the sidebar element itself.
    await expect(page.locator('[data-slot="sidebar"]').first()).toBeVisible();
    await expect(page.getByText("Academics").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /back to dashboard/i })).toBeVisible();

    await page.goto("/finance/salary");
    await expect(page.getByText(/Salary isn't built yet/i)).toBeVisible();

    await page.goto("/some-typo");
    await expect(page.getByText(/can't find that page/i)).toBeVisible();
  });
});
