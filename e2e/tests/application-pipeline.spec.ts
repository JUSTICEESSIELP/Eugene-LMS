import { test, expect, type APIRequestContext } from "@playwright/test";
import { signInAsApi } from "./support/auth";

/**
 * The admissions pipeline had no transition rules at all: an application could
 * go accepted -> pending -> accepted -> rejected, and each hop dispatched
 * another email. The second acceptance sent a "your account is ready" message
 * with no temporary password in it, telling the applicant to sign in with a
 * password they had never been given; and rejecting an already-accepted
 * applicant left the student account it had minted fully active.
 *
 * `accepted` and `rejected` are now terminal.
 */
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

test.skip(!email || !password, "ADMIN_EMAIL / ADMIN_PASSWORD not set");

const stamp = Date.now();
let admin: APIRequestContext;
const applications: string[] = [];
const users: string[] = [];

// Any of these may pause for a rate-limit window.
test.describe.configure({ timeout: 150_000 });

test.beforeAll(async ({ playwright, baseURL }) => {
  admin = (await signInAsApi(playwright, baseURL, { email: email!, password: password! }, "admin sign-in")).context;
});

test.afterAll(async () => {
  for (const id of users) await admin.delete(`/api/users/delete/${id}`);
  for (const id of applications) await admin.delete(`/api/applications/${id}`);
  await admin?.dispose();
});

/**
 * The public endpoint is limited to 5/min/IP — deliberately, since it is
 * unauthenticated and sends mail. These specs spend that budget quickly, so
 * every submission waits the window out once rather than failing on a 429 that
 * only proves the limiter works. The limiter is asserted directly in its own
 * test at the bottom of this file.
 */
const postApplication = async (request: APIRequestContext, data: object) => {
  let res = await request.post("/api/applications", { data });
  if (res.status() === 429) {
    await new Promise((resolve) => setTimeout(resolve, 62_000));
    res = await request.post("/api/applications", { data });
  }
  return res;
};

const apply = async (request: APIRequestContext, suffix: string) => {
  const res = await postApplication(request, {
    fullName: `Pipeline Probe ${suffix}`,
    // @example.com is on the undeliverable list, so no mail leaves the building.
    email: `pipeline-${suffix}-${stamp}@example.com`,
    program: `Pipeline Programme ${suffix}`,
  });
  expect(res.status(), "submitting an application").toBe(201);
  const id = (await res.json())._id;
  applications.push(id);
  return id;
};

test("an accepted application cannot be reopened or re-accepted", async ({ request }) => {
  const id = await apply(request, "a");

  const accepted = await admin.patch(`/api/applications/${id}`, {
    data: { status: "accepted" },
  });
  expect(accepted.ok()).toBeTruthy();
  const account = (await accepted.json()).account;
  expect(account.created, "accepting mints the student account").toBe(true);
  expect(account.temporaryPassword, "and returns the password once").toBeTruthy();
  users.push(account.userId);

  for (const status of ["pending", "reviewing", "rejected"]) {
    const res = await admin.patch(`/api/applications/${id}`, { data: { status } });
    expect(res.status(), `accepted -> ${status} must be refused`).toBe(409);
  }

  // Re-saving the *same* status stays allowed and stays a no-op: it must not
  // mint a second account, and must not re-send the acceptance email — which is
  // what the old code did, with no temporary password in it the second time.
  const again = await admin.patch(`/api/applications/${id}`, {
    data: { status: "accepted" },
  });
  expect(again.ok(), "re-saving accepted is idempotent").toBeTruthy();
  const body = await again.json();
  expect(body.account.created, "no second account").toBe(false);
  expect(body.account.temporaryPassword, "no second password").toBeFalsy();
});

test("a rejected application is terminal too", async ({ request }) => {
  const id = await apply(request, "b");

  expect((await admin.patch(`/api/applications/${id}`, { data: { status: "rejected" } })).ok())
    .toBeTruthy();

  const res = await admin.patch(`/api/applications/${id}`, { data: { status: "accepted" } });
  expect(res.status(), "rejected -> accepted must be refused").toBe(409);
});

test("pending and reviewing still move in both directions", async ({ request }) => {
  const id = await apply(request, "c");
  expect((await admin.patch(`/api/applications/${id}`, { data: { status: "reviewing" } })).ok())
    .toBeTruthy();
  expect((await admin.patch(`/api/applications/${id}`, { data: { status: "pending" } })).ok())
    .toBeTruthy();
});

test("a duplicate application is refused while it is under review", async ({ request }) => {
  const data = {
    fullName: "Duplicate Probe",
    email: `duplicate-${stamp}@example.com`,
    program: "Duplicate Programme",
  };

  const first = await postApplication(request, data);
  expect(first.status()).toBe(201);
  applications.push((await first.json())._id);

  // Moving it to `reviewing` used to release the duplicate guard, so the same
  // person could re-apply and re-trigger the confirmation email.
  expect(
    (await admin.patch(`/api/applications/${applications.at(-1)}`, {
      data: { status: "reviewing" },
    })).ok(),
  ).toBeTruthy();

  const second = await postApplication(request, data);
  expect(second.status(), "a second application while under review").toBe(409);
});

test("the public application form rejects junk before it reaches the database", async ({
  request,
}) => {
  const bad = await postApplication(request, {
    fullName: "No Email",
    email: "not-an-email",
    program: "Anything",
  });
  expect(bad.status(), "an invalid address").toBe(400);

  const long = await postApplication(request, {
    fullName: "x".repeat(500),
    email: `long-${stamp}@example.com`,
    program: "P",
  });
  expect(long.status(), "an absurdly long name").toBe(400);
});

test("the public application endpoint is rate limited", async ({ request }) => {
  // Burn through the window deliberately: this endpoint is unauthenticated and
  // sends mail, so an unthrottled one is a way to make Veya send it on demand.
  const codes: number[] = [];
  for (let i = 0; i < 8; i++) {
    const res = await request.post("/api/applications", {
      data: {
        fullName: `Flood ${i}`,
        email: `flood-${i}-${stamp}@example.com`,
        program: `Flood Programme ${i}`,
      },
    });
    if (res.status() === 201) applications.push((await res.json())._id);
    codes.push(res.status());
  }
  expect(codes, "the limiter must cut in").toContain(429);

  // Hand the budget back. The limiter is per-IP and the whole suite shares one,
  // so leaving it spent makes every later spec that submits an application fail
  // with a 429 that says nothing about the code under test.
  await new Promise((resolve) => setTimeout(resolve, 62_000));
});
