import { test, expect } from "@playwright/test";

/**
 * Accepting an application is what admits someone: it mints the student
 * account. This walks the whole loop — apply, accept, read the temporary
 * password out of the admin dialog, sign in as the new student.
 *
 * Email delivery is deliberately not asserted. The Worker sends it on
 * `waitUntil` after the response, and applicants here use `@example.com`
 * addresses that the sender skips on purpose.
 *
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx playwright test accept-application
 */
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

test.skip(!email || !password, "ADMIN_EMAIL / ADMIN_PASSWORD not set");

const signInAsAdmin = async (page: import("@playwright/test").Page) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email!);
  await page.getByLabel(/password/i).fill(password!);
  await page.getByRole("button", { name: /sign in/i }).first().click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
};

/**
 * Narrow the queue to one applicant. The search box debounces for 400ms and
 * then refetches, which swaps the table rows out — opening a row's select
 * before that lands gets the option detached mid-click.
 */
const findOnly = async (page: import("@playwright/test").Page, applicantEmail: string) => {
  await page.getByPlaceholder(/Search applicants/i).fill(applicantEmail);
  const row = page.getByRole("row").filter({ hasText: applicantEmail });
  await expect(row).toHaveCount(1, { timeout: 15000 });
  await page.waitForTimeout(1200);
  return row;
};

/** Move one application to a status via the row's status select. */
const setStatus = async (
  page: import("@playwright/test").Page,
  applicantEmail: string,
  status: string,
) => {
  const row = await findOnly(page, applicantEmail);
  await row.getByRole("combobox").click();
  await page.getByRole("option", { name: status, exact: true }).click();
};

test("accepting an application creates a student who can sign in", async ({ page, browser }) => {
  const applicantEmail = `accept-${Date.now()}@example.com`;

  await page.goto("/apply");
  await page.getByLabel("Full name").fill("Accepted Applicant");
  await page.getByLabel("Email").fill(applicantEmail);
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "Computer Science" }).click();
  await page.getByRole("button", { name: /Submit application/i }).click();
  await expect(page.getByText(/Application received/i)).toBeVisible({ timeout: 15000 });

  await signInAsAdmin(page);
  await page.goto("/admissions");
  await setStatus(page, applicantEmail, "Accepted");

  // The temporary password is shown exactly once, in a dialog.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 15000 });
  await expect(dialog).toContainText(/Student account created/i);
  await expect(dialog).toContainText(applicantEmail);
  // The admin is told the student still has no class.
  await expect(dialog).toContainText(/no class is assigned/i);

  const tempPassword = (
    await dialog.getByText(/^[A-Za-z2-9]{16}$/).first().innerText()
  ).trim();
  expect(tempPassword, "a 16-character temporary password should be shown").toHaveLength(16);

  // The new student signs in with it — in a clean context, so this proves the
  // account works rather than riding the admin's cookie.
  // `browser.newContext()` doesn't inherit the project's `use` block, so the
  // base URL has to be handed over explicitly.
  const studentContext = await browser.newContext({
    baseURL: process.env.BASE_URL ?? "https://eugene-lms.workplacefiles.com",
  });
  const studentPage = await studentContext.newPage();
  await studentPage.goto("/login");
  await studentPage.getByLabel(/email/i).fill(applicantEmail);
  await studentPage.getByLabel(/password/i).fill(tempPassword);
  await studentPage.getByRole("button", { name: /sign in/i }).first().click();
  await expect(studentPage).toHaveURL(/\/dashboard/, { timeout: 20000 });
  await studentContext.close();

  // Re-accepting must not mint a second account or a second password.
  await page.getByRole("button", { name: /^Done$/ }).click();
  await page.reload();
  const row = await findOnly(page, applicantEmail);
  await expect(row).toContainText("accepted");
});
