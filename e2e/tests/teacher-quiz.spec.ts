import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * The AI quiz dialog loads subjects and classes with one Promise.all. GET
 * /api/classes was admin-only, so for a teacher the whole load rejected and
 * both dropdowns came up empty — no teacher could generate a quiz. Found while
 * recording the product demo. Creates its own teacher and removes it after.
 */
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
test.skip(!email || !password, "ADMIN_EMAIL / ADMIN_PASSWORD not set");

const teacher = { name: "Quiz Probe Teacher", email: `quiz-probe-${Date.now()}@example.com`, password: "ProbePassword123" };
let api: APIRequestContext;
let teacherId = "";

test.beforeAll(async ({ playwright, baseURL }) => {
  api = await playwright.request.newContext({ baseURL });
  expect((await api.post("/api/users/login", { data: { email, password } })).ok(), "admin sign-in").toBeTruthy();
  const created = await api.post("/api/users/register", { data: { ...teacher, role: "teacher" } });
  expect(created.ok(), "create probe teacher").toBeTruthy();
  teacherId = (await created.json())._id;
});

test.afterAll(async () => {
  if (teacherId) await api.delete(`/api/users/delete/${teacherId}`);
  await api.dispose();
});

test("a teacher can open the AI quiz dialog with classes and subjects to choose from", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(teacher.email);
  await page.getByLabel(/password/i).fill(teacher.password);
  await page.getByRole("button", { name: /sign in/i }).first().click();
  await page.waitForURL(/dashboard/, { timeout: 20000 });

  // The read the dialog depends on.
  const classes = await page.request.get("/api/classes");
  expect(classes.status(), "teachers can read the class list").toBe(200);

  await page.goto("/lms/exams");
  await page.getByRole("button", { name: /New AI Quiz/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();

  for (const [i, what] of [[0, "subject"], [1, "class"]] as const) {
    await dialog.getByRole("combobox").nth(i).click();
    await expect(page.getByRole("option").first(), `${what} options should load`).toBeVisible({ timeout: 10000 });
    await page.keyboard.press("Escape");
  }
});

test("teachers still cannot change classes", async ({ playwright, baseURL }) => {
  // Reading the list was widened for teachers; writing must not have been.
  const asTeacher = await playwright.request.newContext({ baseURL });
  const login = await asTeacher.post("/api/users/login", { data: { email: teacher.email, password: teacher.password } });
  expect(login.ok(), "teacher sign-in").toBeTruthy();
  const res = await asTeacher.post("/api/classes/create", { data: { name: "Should Not Exist", academicYear: "x" } });
  expect(res.status(), "creating a class stays admin-only").toBe(403);
  await asTeacher.dispose();
});
