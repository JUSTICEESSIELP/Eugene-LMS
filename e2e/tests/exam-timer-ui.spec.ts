import { test, expect, type APIRequestContext } from "@playwright/test";
import { signInAsApi } from "./support/auth";

/**
 * The countdown a student actually sees.
 *
 * `{exam.duration} Minutes` was rendered and nothing counted down. The server is
 * the control — it refuses a late submission regardless — but the student has to
 * be able to see the time they have left, and the number has to come from the
 * server's clock rather than one the page invented on load.
 */
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

test.skip(!email || !password, "ADMIN_EMAIL / ADMIN_PASSWORD not set");

const stamp = Date.now();
const student = {
  name: "Timer UI Probe",
  email: `timer-ui-${stamp}@example.com`,
  password: "ProbePassword123",
  role: "student",
};

let admin: APIRequestContext;
let studentId = "";
let classId = "";
let subjectId = "";
let examId = "";

test.beforeAll(async ({ playwright, baseURL }) => {
  admin = (await signInAsApi(playwright, baseURL, { email: email!, password: password! }, "admin"))
    .context;

  const yearId = (await (await admin.get("/api/academic-years/current")).json())._id;

  const cls = await admin.post("/api/classes/create", {
    data: { name: `Timer UI ${stamp}`, academicYear: yearId },
  });
  classId = (await cls.json())._id;

  const sub = await admin.post("/api/subjects/create", {
    data: { name: `Timer UI Subject ${stamp}`, code: `TU${stamp}`.slice(0, 12) },
  });
  subjectId = (await sub.json())._id;

  studentId = (
    await (await admin.post("/api/users/register", { data: { ...student, studentClass: classId } })).json()
  )._id;

  const exam = await admin.post("/api/exams", {
    data: {
      title: `Timed Paper ${stamp}`,
      subject: subjectId,
      class: classId,
      duration: 30,
      isActive: true,
      questions: [
        { questionText: "What is 2 + 2?", type: "MCQ", options: ["3", "4"], correctAnswer: "4", points: 1 },
      ],
    },
  });
  examId = (await exam.json())._id;
});

test.afterAll(async () => {
  if (examId) await admin.delete(`/api/exams/${examId}`);
  if (studentId) await admin.delete(`/api/users/delete/${studentId}`);
  if (classId) await admin.delete(`/api/classes/delete/${classId}`);
  if (subjectId) await admin.delete(`/api/subjects/delete/${subjectId}`);
  await admin?.dispose();
});

test("a student sitting an exam sees a countdown that ticks down", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(student.email);
  await page.getByLabel(/password/i).fill(student.password);
  await page.getByRole("button", { name: /sign in/i }).first().click();
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });

  await page.goto(`/lms/exams/${examId}`);

  const countdown = page.getByText(/^\d{2}:\d{2} left$/);
  await expect(countdown, "the remaining time is shown").toBeVisible({ timeout: 15000 });

  const first = await countdown.innerText();
  // It must be counting from the server's window, not from the full duration on
  // every render.
  expect(first).toMatch(/^(29|28):\d{2} left$/);

  await page.waitForTimeout(2500);
  const second = await countdown.innerText();
  expect(second, "the clock actually ticks").not.toBe(first);
});
