import { test, expect } from "@playwright/test";

/**
 * The exam detail page set `loading` back to true after fetching the exam and
 * only cleared it inside the student branch — so for a teacher or admin it
 * sat on the spinner forever and no one could review or publish an exam.
 */
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

test.skip(!email || !password, "ADMIN_EMAIL / ADMIN_PASSWORD not set");

test("staff can open an exam and see its controls and results", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email!);
  await page.getByLabel(/password/i).fill(password!);
  await page.getByRole("button", { name: /sign in/i }).first().click();
  await page.waitForURL(/dashboard/, { timeout: 20000 });

  await page.goto("/lms/exams");
  const open = page.getByRole("button", { name: /Manage Questions/i }).first();
  await open.waitFor({ state: "visible", timeout: 15000 });
  await open.click();
  await expect(page).toHaveURL(/\/lms\/exams\/[0-9a-f]{24}/);

  // The page must actually render, not sit on the spinner.
  await expect(page.getByText(/Teacher Controls/i)).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("button", { name: /Publish Exam|Unpublish Exam/i })).toBeVisible();

  // And results must be reachable rather than graded-but-invisible.
  await expect(page.getByRole("heading", { name: /^Results$/i })).toBeVisible();
  await expect(page.getByText(/^Submitted$/).first()).toBeVisible();
});
