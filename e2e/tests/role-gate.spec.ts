import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * The router used to check nothing, so any signed-in user could type an admin
 * URL and get the full screen — verified originally by signing in as a parent.
 *
 * This spec creates its own throwaway parent through the API and removes it
 * afterwards, so it runs anywhere rather than depending on accounts that
 * happen to exist in one environment.
 */
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

test.skip(!email || !password, "ADMIN_EMAIL / ADMIN_PASSWORD not set");

const ADMIN_ONLY = ["/admissions", "/classes", "/users/admins", "/settings/academic-years"];

const parent = {
  name: "Role Gate Probe",
  email: `role-gate-${Date.now()}@example.com`,
  password: "ProbePassword123",
};

let api: APIRequestContext;
let parentId = "";

test.beforeAll(async ({ playwright, baseURL }) => {
  api = await playwright.request.newContext({ baseURL });
  const login = await api.post("/api/users/login", { data: { email, password } });
  expect(login.ok(), "admin sign-in for setup").toBeTruthy();

  const created = await api.post("/api/users/register", {
    data: { ...parent, role: "parent" },
  });
  expect(created.ok(), "creating the probe parent").toBeTruthy();
  parentId = (await created.json())._id;
});

test.afterAll(async () => {
  if (parentId) await api.delete(`/api/users/delete/${parentId}`);
  await api.dispose();
});

const signIn = async (page: any, user: string, pass: string) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user);
  await page.getByLabel(/password/i).fill(pass);
  await page.getByRole("button", { name: /sign in/i }).first().click();
  await page.waitForURL(/\/(dashboard|settings)/, { timeout: 20000 });
};

test("a parent cannot reach admin screens by typing the URL", async ({ page }) => {
  await signIn(page, parent.email, parent.password);

  for (const path of ADMIN_ONLY) {
    await page.goto(path);
    await page.waitForTimeout(800);
    const body = await page.locator("body").innerText();
    expect(body, `${path} should be refused`).toMatch(/for other roles/i);
    expect(body, `${path} leaked an admin control`).not.toMatch(/Create Class|Add New Year/i);
  }
});

test("an admin still reaches all of them", async ({ page }) => {
  await signIn(page, email!, password!);
  for (const path of ADMIN_ONLY) {
    await page.goto(path);
    await page.waitForTimeout(800);
    const body = await page.locator("body").innerText();
    expect(body, `${path} should be allowed for an admin`).not.toMatch(/for other roles/i);
  }
});
