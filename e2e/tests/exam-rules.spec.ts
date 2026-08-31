import { test, expect, type APIRequestContext } from "@playwright/test";
import { signInAsApi } from "./support/auth";

/**
 * Exam visibility and timing.
 *
 * `GET /api/exams/:id` only checked the student's class, never `isActive` — so
 * a student who knew an id could read a paper that had not been published,
 * questions and all, even though the list endpoint correctly hid it (G-new).
 *
 * `duration` was rendered on the exam page and enforced nowhere: no timer, and
 * the submit endpoint never looked at elapsed time (G-10). The clock now starts
 * server-side the first time the student opens the paper.
 */
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

test.skip(!email || !password, "ADMIN_EMAIL / ADMIN_PASSWORD not set");

const stamp = Date.now();
let admin: APIRequestContext;
let asStudent: APIRequestContext;

let studentId = "";
let classId = "";
let subjectId = "";
let draftExamId = "";
let liveExamId = "";

const student = {
  name: "Exam Rules Probe",
  email: `exam-rules-${stamp}@example.com`,
  password: "ProbePassword123",
  role: "student",
};

test.beforeAll(async ({ playwright, baseURL }) => {
  admin = (await signInAsApi(playwright, baseURL, { email: email!, password: password! }, "admin sign-in")).context;

  // A class and subject of our own, so the spec never depends on seed data.
  const year = await admin.get("/api/academic-years/current");
  expect(year.ok(), "an academic year must be current").toBeTruthy();
  const yearId = (await year.json())._id;

  const cls = await admin.post("/api/classes/create", {
    data: { name: `Exam Rules ${stamp}`, academicYear: yearId },
  });
  expect(cls.ok(), "creating the probe class").toBeTruthy();
  classId = (await cls.json())._id;

  const sub = await admin.post("/api/subjects/create", {
    data: { name: `Exam Rules Subject ${stamp}`, code: `ER${stamp}`.slice(0, 12) },
  });
  expect(sub.ok(), "creating the probe subject").toBeTruthy();
  subjectId = (await sub.json())._id;

  const created = await admin.post("/api/users/register", {
    data: { ...student, studentClass: classId },
  });
  expect(created.ok(), "creating the probe student").toBeTruthy();
  studentId = (await created.json())._id;

  const question = {
    questionText: "What is 2 + 2?",
    type: "MCQ",
    options: ["3", "4"],
    correctAnswer: "4",
    points: 5,
  };

  const draft = await admin.post("/api/exams", {
    data: {
      title: `Unpublished Probe ${stamp}`,
      subject: subjectId,
      class: classId,
      isActive: false,
      questions: [question],
    },
  });
  expect(draft.ok(), "creating the draft exam").toBeTruthy();
  draftExamId = (await draft.json())._id;

  const live = await admin.post("/api/exams", {
    data: {
      title: `Published Probe ${stamp}`,
      subject: subjectId,
      class: classId,
      duration: 45,
      isActive: true,
      questions: [question],
    },
  });
  expect(live.ok(), "creating the live exam").toBeTruthy();
  liveExamId = (await live.json())._id;

  asStudent = (
    await signInAsApi(playwright, baseURL, { email: student.email, password: student.password }, "probe student sign-in")
  ).context;
});

test.afterAll(async () => {
  for (const id of [draftExamId, liveExamId]) {
    if (id) await admin.delete(`/api/exams/${id}`);
  }
  if (studentId) await admin.delete(`/api/users/delete/${studentId}`);
  if (classId) await admin.delete(`/api/classes/delete/${classId}`);
  if (subjectId) await admin.delete(`/api/subjects/delete/${subjectId}`);
  await asStudent?.dispose();
  await admin?.dispose();
});

test("a student cannot read an unpublished exam, even by id", async () => {
  const res = await asStudent.get(`/api/exams/${draftExamId}`);
  expect(res.status(), "fetching a draft directly").toBe(403);

  const body = await res.text();
  expect(body, "the draft's questions must not leak").not.toContain("What is 2 + 2?");
});

test("staff can still preview an unpublished exam", async () => {
  const res = await admin.get(`/api/exams/${draftExamId}`);
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).questions.length).toBeGreaterThan(0);
});

test("the exam list never contains a draft for a student", async () => {
  const res = await asStudent.get("/api/exams");
  expect(res.ok()).toBeTruthy();
  const titles = (await res.json()).map((e: any) => e.title);
  expect(titles).not.toContain(`Unpublished Probe ${stamp}`);
});

test("opening a published exam starts a server-side clock", async () => {
  const res = await asStudent.get(`/api/exams/${liveExamId}`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();

  expect(body.attempt, "an attempt window is returned to the student").toBeTruthy();
  expect(body.attempt.startedAt).toBeTruthy();
  expect(body.attempt.remainingMs).toBeGreaterThan(0);
  // 45 minutes, minus however long the round trip took.
  expect(body.attempt.remainingMs).toBeLessThanOrEqual(45 * 60_000);

  // Re-opening must not restart the clock.
  const again = await asStudent.get(`/api/exams/${liveExamId}`);
  expect((await again.json()).attempt.startedAt).toBe(body.attempt.startedAt);
});

test("staff previewing an exam are not put on the clock", async () => {
  const res = await admin.get(`/api/exams/${liveExamId}`);
  expect((await res.json()).attempt ?? null).toBeNull();
});

test("a submission is graded on the questions' points, not their count", async () => {
  const exam = await (await asStudent.get(`/api/exams/${liveExamId}`)).json();
  const answers = exam.questions.map((q: any) => ({ questionId: q._id, answer: "4" }));

  const res = await asStudent.post(`/api/exams/${liveExamId}/submit`, { data: { answers } });
  expect(res.status()).toBe(201);
  const body = await res.json();

  // One question worth 5 points: a correct answer is 5/5, not 1/1.
  expect(body.totalPoints, "totalPoints is the sum of points").toBe(5);
  expect(body.score).toBe(5);
});

test("the same exam cannot be submitted twice", async () => {
  const res = await asStudent.post(`/api/exams/${liveExamId}/submit`, {
    data: { answers: [] },
  });
  expect(res.status()).toBe(403);
});
