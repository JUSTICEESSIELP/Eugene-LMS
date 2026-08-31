import { test, expect, type APIRequestContext } from "@playwright/test";
import { signInAsApi } from "./support/auth";

/**
 * Role boundaries at the API.
 *
 * `POST /api/users/register` and `PUT /api/users/update/:id` were gated with
 * `authorize(["admin","teacher"])` and nothing else, and both read `role`
 * straight off the request body. A teacher could therefore mint an admin
 * account, promote themselves, or overwrite the admin's password and sign in as
 * them — the first teacher account was a full takeover of the school.
 *
 * These specs create a throwaway teacher, do the takeover from their session,
 * and assert every step is refused.
 */
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

test.skip(!email || !password, "ADMIN_EMAIL / ADMIN_PASSWORD not set");

const stamp = Date.now();
const teacher = {
  name: "Authz Probe Teacher",
  email: `authz-teacher-${stamp}@example.com`,
  password: "ProbePassword123",
  role: "teacher",
};

let admin: APIRequestContext;
let asTeacher: APIRequestContext;
let teacherId = "";
let adminId = "";
const strays: string[] = [];

test.beforeAll(async ({ playwright, baseURL }) => {
  const asAdmin = await signInAsApi(playwright, baseURL, { email: email!, password: password! }, "admin sign-in for setup");
  admin = asAdmin.context;
  adminId = asAdmin.user._id;

  const created = await admin.post("/api/users/register", { data: teacher });
  expect(created.ok(), "creating the probe teacher").toBeTruthy();
  teacherId = (await created.json())._id;

  asTeacher = (
    await signInAsApi(playwright, baseURL, { email: teacher.email, password: teacher.password }, "probe teacher sign-in")
  ).context;
});

test.afterAll(async () => {
  for (const id of strays) await admin.delete(`/api/users/delete/${id}`);
  if (teacherId) await admin.delete(`/api/users/delete/${teacherId}`);
  await asTeacher?.dispose();
  await admin?.dispose();
});

test("a teacher cannot create an account above their own role", async () => {
  for (const role of ["admin", "teacher"]) {
    const res = await asTeacher.post("/api/users/register", {
      data: {
        name: `Escalation ${role}`,
        email: `escalate-${role}-${stamp}@example.com`,
        password: "ProbePassword123",
        role,
      },
    });
    expect(res.status(), `a teacher must not create a ${role}`).toBe(400);
    if (res.ok()) strays.push((await res.json())._id);
  }
});

test("a teacher can still create a student", async () => {
  const res = await asTeacher.post("/api/users/register", {
    data: {
      name: "Legit Student",
      email: `authz-student-${stamp}@example.com`,
      password: "ProbePassword123",
      role: "student",
    },
  });
  expect(res.status()).toBe(201);
  strays.push((await res.json())._id);
});

test("a teacher cannot promote themselves", async () => {
  const res = await asTeacher.put(`/api/users/update/${teacherId}`, {
    data: { role: "admin" },
  });
  expect(res.ok()).toBeFalsy();

  const after = await admin.get(`/api/users?search=${encodeURIComponent(teacher.email)}`);
  const found = (await after.json()).users.find((u: any) => u._id === teacherId);
  expect(found.role, "the teacher's role must be unchanged").toBe("teacher");
});

test("a teacher cannot touch an admin account", async () => {
  const reset = await asTeacher.put(`/api/users/update/${adminId}`, {
    data: { password: "TeacherOwnsYou1" },
  });
  expect(reset.status(), "overwriting the admin's password").toBe(403);

  const removed = await asTeacher.delete(`/api/users/delete/${adminId}`);
  expect(removed.status(), "deleting the admin").toBe(403);

  // The admin's own password must still work.
  const stillWorks = await admin.post("/api/users/login", {
    data: { email, password },
  });
  expect(stillWorks.ok(), "the admin password was not changed").toBeTruthy();
});

test("a teacher may still edit their own profile", async () => {
  const res = await asTeacher.put(`/api/users/update/${teacherId}`, {
    data: { name: "Authz Probe Teacher (renamed)" },
  });
  expect(res.ok()).toBeTruthy();
});

test("bad input is refused with a message, not a 500", async () => {
  const cases: [string, string, object, number][] = [
    ["an unknown role", "/api/users/register", {
      name: "X", email: `badrole-${stamp}@example.com`, password: "ProbePassword123", role: "superuser",
    }, 400],
    ["an unparseable date", "/api/academic-years/create", {
      name: "Bad Year", fromYear: "banana", toYear: "2027-01-01",
    }, 400],
  ];

  for (const [label, path, data, expected] of cases) {
    const res = await admin.post(path, { data });
    expect(res.status(), label).toBe(expected);
    const body = await res.json();
    // A raw engine error used to come back here — including the users table's
    // CHECK constraint, table definition and all.
    expect(body.message, `${label} must not leak internals`).not.toMatch(
      /D1_ERROR|SQLITE|CHECK constraint|Invalid time value/i,
    );
  }
});

test("pagination limits are clamped", async () => {
  const res = await admin.get("/api/users?limit=100000");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.pagination.limit).toBeLessThanOrEqual(100);
});
