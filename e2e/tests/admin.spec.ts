import { test, expect } from "@playwright/test";

/**
 * Exercises the admin side of admissions. Credentials come from the
 * environment so this suite carries no secrets:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx playwright test
 */
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

test.skip(!email || !password, "ADMIN_EMAIL / ADMIN_PASSWORD not set");

test("an admin can sign in and review submitted applications", async ({ page }) => {
  const applicantEmail = `e2e-${Date.now()}@example.com`;

  // 1. A visitor applies.
  await page.goto("/apply");
  await page.getByLabel("Full name").fill("E2E Applicant");
  await page.getByLabel("Email").fill(applicantEmail);
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "Computer Science" }).click();
  await page.getByRole("button", { name: /Submit application/i }).click();
  await expect(page.getByText(/Application received/i)).toBeVisible({ timeout: 15000 });

  // 2. The admin signs in.
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email!);
  await page.getByLabel(/password/i).fill(password!);
  await page.getByRole("button", { name: /sign in/i }).first().click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });

  // 3. The application shows up in the admissions queue.
  await page.goto("/admissions");
  await expect(page.getByRole("heading", { name: /Admissions/i })).toBeVisible();
  await expect(page.getByText(applicantEmail)).toBeVisible({ timeout: 15000 });
});
