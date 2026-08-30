import { test, expect } from "@playwright/test";

/**
 * Walks an admin through every real page and asserts each one renders. Guards
 * against a UI-wide change (theme, tokens, shared components) taking a screen
 * down somewhere that the landing-page specs never touch.
 */
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

test.skip(!email || !password, "ADMIN_EMAIL / ADMIN_PASSWORD not set");

const PAGES: Array<[string, RegExp]> = [
  ["/dashboard", /dashboard/i],
  ["/classes", /class/i],
  ["/subjects", /subject/i],
  ["/timetable", /timetable/i],
  ["/lms/exams", /quiz|exam/i],
  ["/users/students", /student/i],
  ["/users/teachers", /teacher/i],
  ["/settings/academic-years", /academic year/i],
  ["/admissions", /admission/i],
  ["/activities-log", /dashboard|activit/i],
];

test("every admin page renders without an error boundary", async ({ page }) => {
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(`pageerror: ${e.message}`));

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email!);
  await page.getByLabel(/password/i).fill(password!);
  await page.getByRole("button", { name: /sign in/i }).first().click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });

  for (const [path, expected] of PAGES) {
    await page.goto(path);
    await page.waitForTimeout(900);
    const body = await page.locator("body").innerText();

    // React Router's raw error screen is the tell for a missing/broken route.
    if (/Unexpected Application Error/i.test(body)) {
      failures.push(`${path} -> React Router error boundary`);
      continue;
    }
    if (!expected.test(body)) {
      failures.push(`${path} -> rendered, but no ${expected} in the page text`);
      continue;
    }
    console.log(`  ok  ${path}`);
  }

  expect(failures, `Pages with problems:\n${failures.join("\n")}`).toEqual([]);
});

test("the brand is consistent and the favicon is not Vite's default", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Veya/);

  const icon = await page.locator('link[rel="icon"]').getAttribute("href");
  expect(icon, "favicon should not be the Vite placeholder").not.toMatch(/vite\.svg/);

  // The icon must actually resolve, not 404 into a broken tab image.
  const res = await page.request.get(new URL(icon!, page.url()).toString());
  expect(res.status(), `${icon} should be served`).toBe(200);
  console.log(`  favicon: ${icon} -> ${res.status()} ${res.headers()["content-type"]}`);
});
