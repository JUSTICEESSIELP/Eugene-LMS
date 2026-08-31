import { test, expect, type APIRequestContext } from "@playwright/test";
import { signInAsApi } from "./support/auth";

/**
 * Session lifetime (G-16) and password recovery (G-07).
 *
 * Logging out used to clear the cookie and leave the JWT valid for the rest of
 * its 30 days, and deactivating an account did nothing to the sessions it
 * already had. Both are now bounded by `users.sessionEpoch`.
 */
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

test.skip(!email || !password, "ADMIN_EMAIL / ADMIN_PASSWORD not set");

const stamp = Date.now();
const subject = {
  name: "Session Probe",
  email: `session-probe-${stamp}@example.com`,
  password: "ProbePassword123",
  role: "student",
};

let admin: APIRequestContext;
let subjectId = "";

test.beforeAll(async ({ playwright, baseURL }) => {
  admin = (await signInAsApi(playwright, baseURL, { email: email!, password: password! }, "admin sign-in for setup")).context;
  const created = await admin.post("/api/users/register", { data: subject });
  expect(created.ok(), "creating the probe user").toBeTruthy();
  subjectId = (await created.json())._id;
});

test.afterAll(async () => {
  if (subjectId) await admin.delete(`/api/users/delete/${subjectId}`);
  await admin?.dispose();
});

test("a token stops working once its owner logs out", async ({ playwright, baseURL }) => {
  // Hold the token directly: the cookie going away was never the point, the
  // token outliving it for the rest of its 30 days was.
  const { context: bearer } = await signInAsApi(playwright, baseURL, subject, "probe sign-in");

  expect((await bearer.get("/api/dashboard/stats")).ok(), "before logout").toBeTruthy();
  expect((await bearer.post("/api/users/logout")).ok(), "logging out").toBeTruthy();

  const after = await bearer.get("/api/dashboard/stats");
  expect(after.status(), "the same token after logout").toBe(401);

  await bearer.dispose();
});

test("deactivating an account ends the session it already had", async ({
  playwright,
  baseURL,
}) => {
  const { context: session } = await signInAsApi(playwright, baseURL, subject, "probe sign-in");
  expect((await session.get("/api/dashboard/stats")).ok(), "before").toBeTruthy();

  const off = await admin.put(`/api/users/update/${subjectId}`, {
    data: { isActive: false },
  });
  expect(off.ok(), "deactivating the account").toBeTruthy();

  const after = await session.get("/api/dashboard/stats");
  expect(after.status(), "the live session after deactivation").toBe(401);

  // And the profile probe must report them as signed out, not signed in.
  const probe = await session.get("/api/users/profile");
  expect((await probe.json()).user).toBeNull();

  await admin.put(`/api/users/update/${subjectId}`, { data: { isActive: true } });
  await session.dispose();
});

test("a password reset request never reveals whether the address exists", async ({
  request,
}) => {
  const known = await request.post("/api/users/forgot-password", {
    data: { email: subject.email },
  });
  const unknown = await request.post("/api/users/forgot-password", {
    data: { email: `definitely-nobody-${stamp}@example.com` },
  });

  expect(known.status()).toBe(200);
  expect(unknown.status()).toBe(200);
  expect(await known.json()).toEqual(await unknown.json());
});

test("a forged or expired reset token is refused", async ({ request }) => {
  const res = await request.post("/api/users/reset-password", {
    data: { token: "f".repeat(64), password: "SomeNewPassword1" },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).message).toMatch(/invalid or has expired/i);
});

test("the reset page renders and refuses a link with no token", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: /reset your password/i })).toBeVisible();

  await page.goto("/reset-password");
  await expect(page.getByText(/this link is incomplete/i)).toBeVisible();
});

test("the sign-in page offers a way out of a forgotten password", async ({ page }) => {
  await page.goto("/login");
  const link = page.getByRole("link", { name: /forgot your password/i });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/forgot-password/);
});
