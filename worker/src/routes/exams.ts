import { Hono } from "hono";
import type { AppEnv } from "../types";
import { authorize, protect } from "../lib/auth";
import { logActivity, lookup, paginate, populated } from "../lib/db";
import { newId, now } from "../lib/ids";
import { examOut, parseJson, submissionOut } from "../lib/rows";
import { generateExamJob, gradeSubmission, SubmissionNotAllowed } from "../jobs";
import { BadRequest, parseInt_, parseOptionalDate, parseString } from "../lib/validate";

const exams = new Hono<AppEnv>();

const canSeeAnswers = (role: string) => role === "teacher" || role === "admin";

/** An exam nobody has published yet is staff-only, whatever class it belongs to. */
const isStaff = (role: string) => role === "teacher" || role === "admin";

// A paper cannot run for a quarter of an hour or for a fortnight.
const MIN_DURATION = 1;
const MAX_DURATION = 8 * 60;
const MAX_QUESTIONS = 200;

/** Grace on the server-side clock, so a slow final request isn't punished. */
const SUBMIT_GRACE_MS = 15_000;

const dueOrDefault = (value: unknown) =>
  parseOptionalDate(value, "dueDate") ??
  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

/**
 * Normalises a question off the wire. `points` used to be `Number(q.points) || 1`,
 * which happily kept -99 — a negative-weight question makes a score
 * uninterpretable and can push a total below zero.
 */
const normaliseQuestion = (q: any) => ({
  _id: q?._id ?? newId(),
  questionText: parseString(q?.questionText, "questionText", { max: 2000, fallback: "" }),
  type: q?.type === "SHORT_ANSWER" ? "SHORT_ANSWER" : "MCQ",
  options: Array.isArray(q?.options) ? q.options.slice(0, 12).map((o: unknown) => String(o)) : [],
  correctAnswer: String(q?.correctAnswer ?? ""),
  points: parseInt_(q?.points, "points", { min: 1, max: 100, fallback: 1 }),
});

/**
 * When this student first opened the paper. `duration` was rendered on the exam
 * page and enforced by nothing — no timer, and the submit endpoint never looked
 * at elapsed time. Reading the questions is what starts the clock, so there is
 * no way to see the paper without the clock running.
 */
const startAttempt = async (
  db: D1Database,
  examId: string,
  studentId: string,
): Promise<string> => {
  const existing = await db
    .prepare("SELECT startedAt FROM exam_attempts WHERE exam = ? AND student = ?")
    .bind(examId, studentId)
    .first();
  if (existing) return String(existing.startedAt);

  const startedAt = now();
  // Two tabs opening at once both insert; the unique index keeps the first.
  await db
    .prepare(
      "INSERT OR IGNORE INTO exam_attempts (id, exam, student, startedAt) VALUES (?, ?, ?, ?)",
    )
    .bind(newId(), examId, studentId, startedAt)
    .run();
  const row = await db
    .prepare("SELECT startedAt FROM exam_attempts WHERE exam = ? AND student = ?")
    .bind(examId, studentId)
    .first();
  return String(row?.startedAt ?? startedAt);
};

/** What the client needs to render a countdown it cannot lie its way past. */
const attemptWindow = (startedAt: string, durationMinutes: number) => {
  const started = new Date(startedAt).getTime();
  const expiresAt = started + durationMinutes * 60_000;
  return {
    startedAt,
    expiresAt: new Date(expiresAt).toISOString(),
    remainingMs: Math.max(0, expiresAt - Date.now()),
  };
};

// POST /api/exams/generate — Private (Teacher & Admin)
exams.post("/generate", protect, authorize(["teacher", "admin"]), async (c) => {
  const body = await c.req.json<any>().catch(() => ({}));
  const { title, subject, class: classId, duration, dueDate, topic, difficulty } = body;

  if (!subject || !classId || !topic) {
    return c.json({ message: "subject, class and topic are required" }, 400);
  }
  const count = parseInt_(body.count, "count", { min: 1, max: 50, fallback: 10 });
  const minutes = parseInt_(duration, "duration", {
    min: MIN_DURATION,
    max: MAX_DURATION,
    fallback: 60,
  });
  const due = dueOrDefault(dueDate);

  const subjectRow = await c.env.DB.prepare("SELECT * FROM subjects WHERE id = ?")
    .bind(subject)
    .first();
  if (!subjectRow) return c.json({ message: "Subject not found" }, 404);
  // The class was never checked, so an exam could be created against an id that
  // does not exist — invisible to every student, and rendering a raw hex id.
  const classRow = await c.env.DB.prepare("SELECT id FROM classes WHERE id = ?")
    .bind(classId)
    .first();
  if (!classRow) return c.json({ message: "Class not found" }, 404);

  const teacherId = c.get("user")._id;
  const ts = now();
  const examId = newId();

  await c.env.DB.prepare(
    `INSERT INTO exams (id, title, subject, class, teacher, duration, dueDate, isActive, questions, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, '[]', 'pending', ?, ?)`,
  )
    .bind(
      examId,
      title || `Auto-Generated: ${topic}`,
      subject,
      classId,
      teacherId,
      minutes,
      due,
      ts,
      ts,
    )
    .run();

  await logActivity(c.env, {
    userId: teacherId,
    action: `User triggered exam generation: ${examId}`,
  });

  c.executionCtx.waitUntil(
    generateExamJob(c.env, {
      examId,
      topic,
      subjectName: subjectRow.name as string,
      difficulty: difficulty || "Medium",
      count,
    }),
  );

  return c.json({ message: "Exam generation started.", examId }, 202);
});

// POST /api/exams — Private (Teacher & Admin), manual create
exams.post("/", protect, authorize(["teacher", "admin"]), async (c) => {
  const body = await c.req.json<any>().catch(() => ({}));
  const { subject, class: classId, duration, dueDate, isActive, questions } = body;
  const title = parseString(body.title, "title", { max: 200 });
  if (!subject || !classId) {
    return c.json({ message: "title, subject and class are required" }, 400);
  }
  const minutes = parseInt_(duration, "duration", {
    min: MIN_DURATION,
    max: MAX_DURATION,
    fallback: 60,
  });
  const due = dueOrDefault(dueDate);

  const [subjectRow, classRow] = await Promise.all([
    c.env.DB.prepare("SELECT id FROM subjects WHERE id = ?").bind(subject).first(),
    c.env.DB.prepare("SELECT id FROM classes WHERE id = ?").bind(classId).first(),
  ]);
  if (!subjectRow) return c.json({ message: "Subject not found" }, 404);
  if (!classRow) return c.json({ message: "Class not found" }, 404);

  const raw = Array.isArray(questions) ? questions : [];
  if (raw.length > MAX_QUESTIONS) {
    throw new BadRequest(`An exam can have at most ${MAX_QUESTIONS} questions`);
  }

  const ts = now();
  const examId = newId();
  const withIds = raw.map(normaliseQuestion);

  await c.env.DB.prepare(
    `INSERT INTO exams (id, title, subject, class, teacher, duration, dueDate, isActive, questions, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?)`,
  )
    .bind(
      examId,
      title,
      subject,
      classId,
      c.get("user")._id,
      minutes,
      due,
      isActive === false ? 0 : 1,
      JSON.stringify(withIds),
      ts,
      ts,
    )
    .run();

  await logActivity(c.env, { userId: c.get("user")._id, action: "User created a new exam" });

  const row = await c.env.DB.prepare("SELECT * FROM exams WHERE id = ?").bind(examId).first();
  return c.json(examOut(row!, { answers: true }), 201);
});

// GET /api/exams — Private, scoped by role
exams.get("/", protect, authorize(["teacher", "student", "admin"]), async (c) => {
  const user = c.get("user");

  let sql = "SELECT * FROM exams";
  const args: unknown[] = [];
  if (user.role === "student") {
    // Students only see live exams for their own class.
    sql += " WHERE class = ? AND isActive = 1";
    args.push(user.studentClass ?? "");
  } else if (user.role === "teacher") {
    sql += " WHERE teacher = ?";
    args.push(user._id);
  }
  // Every other list endpoint is bounded; this one returned a teacher's
  // entire history, questions included.
  const { limit, offset } = paginate(new URL(c.req.url), 50);
  sql += " ORDER BY createdAt DESC LIMIT ? OFFSET ?";
  args.push(limit, offset);

  const { results } = await c.env.DB.prepare(sql).bind(...args).all();
  const rows = (results as any[]).map((r) => examOut(r)); // answers stripped

  const [subjectMap, classMap] = await Promise.all([
    lookup(c.env.DB, "subjects", rows.map((r) => r.subject), ["name"]),
    lookup(c.env.DB, "classes", rows.map((r) => r.class), ["name"]),
  ]);

  return c.json(
    rows.map((r) => ({
      ...r,
      subject: populated(subjectMap, r.subject),
      class: populated(classMap, r.class),
    })),
  );
});

// GET /api/exams/:id/result — Private, the student's own submission
exams.get("/:id/result", protect, async (c) => {
  const examId = c.req.param("id");
  const user = c.get("user");
  // Teachers/admins can pull a specific student's result; students get their own.
  const requested = new URL(c.req.url).searchParams.get("student");
  let studentId = user._id;
  if (requested && requested !== user._id) {
    // Every other staff route on an exam checks ownership; this one did not, so
    // any teacher could read any student's paper on any colleague's exam.
    if (!isStaff(user.role)) {
      return c.json({ message: "Not authorized to view this result" }, 403);
    }
    const owner = await c.env.DB.prepare("SELECT teacher FROM exams WHERE id = ?")
      .bind(examId)
      .first();
    if (user.role !== "admin" && owner && owner.teacher !== user._id) {
      return c.json({ message: "Not authorized to view this result" }, 403);
    }
    studentId = requested;
  }

  const row = await c.env.DB.prepare(
    "SELECT * FROM submissions WHERE exam = ? AND student = ?",
  )
    .bind(examId, studentId)
    .first();
  if (!row) return c.json({ message: "No submission found" }, 404);

  const examRow = await c.env.DB.prepare("SELECT * FROM exams WHERE id = ?")
    .bind(examId)
    .first();

  // The result view needs the correct answers to mark the student's paper.
  return c.json({
    ...submissionOut(row),
    exam: examRow
      ? {
          _id: examRow.id,
          title: examRow.title,
          questions: parseJson<any[]>(examRow.questions, []).map((q) => ({
            _id: q._id,
            questionText: q.questionText,
            options: q.options,
            correctAnswer: q.correctAnswer,
            points: q.points,
          })),
        }
      : null,
  });
});

// POST /api/exams/:id/submit — Private (Student & Admin)
exams.post("/:id/submit", protect, authorize(["student", "admin"]), async (c) => {
  const { answers } = await c.req.json<any>().catch(() => ({}));
  const user = c.get("user");
  try {
    const result = await gradeSubmission(
      c.env,
      { examId: c.req.param("id"), studentId: user._id, answers },
      { role: user.role, studentClass: user.studentClass, graceMs: SUBMIT_GRACE_MS },
    );
    await logActivity(c.env, { userId: user._id, action: "User submitted an exam" });
    return c.json(
      {
        message: "Exam submission received and is being processed.",
        score: result.score,
        totalPoints: result.totalPoints,
      },
      201,
    );
  } catch (error: any) {
    if (error instanceof SubmissionNotAllowed) {
      return c.json({ message: error.message }, 403);
    }
    return c.json({ message: error?.message ?? "Submission failed" }, 500);
  }
});

// PATCH /api/exams/:id/status — Private (Teacher & Admin)
exams.patch("/:id/status", protect, authorize(["teacher", "admin"]), async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT * FROM exams WHERE id = ?").bind(id).first();
  if (!row) return c.json({ message: "Exam not found" }, 404);
  if (user.role !== "admin" && row.teacher !== user._id) {
    return c.json({ message: "Not authorized to modify this exam" }, 403);
  }

  const isActive = row.isActive === 1 ? 0 : 1;
  await c.env.DB.prepare("UPDATE exams SET isActive = ?, updatedAt = ? WHERE id = ?")
    .bind(isActive, now(), id)
    .run();

  await logActivity(c.env, { userId: user._id, action: "User toggled exam status" });
  return c.json({
    message: `Exam is now ${isActive ? "Active" : "Inactive"}`,
    _id: id,
    isActive: isActive === 1,
  });
});

// GET /api/exams/:id/submissions — Private (Teacher & Admin).
// Submissions were graded and stored from the start, but nothing ever listed
// them, so marked work was invisible and the dashboard's "pending grading"
// count led nowhere.
exams.get("/:id/submissions", protect, authorize(["teacher", "admin"]), async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  const exam = await c.env.DB.prepare("SELECT * FROM exams WHERE id = ?").bind(id).first();
  if (!exam) return c.json({ message: "Exam not found" }, 404);
  if (user.role !== "admin" && exam.teacher !== user._id) {
    return c.json({ message: "Not authorized to view these results" }, 403);
  }

  const { results } = await c.env.DB.prepare(
    "SELECT * FROM submissions WHERE exam = ? ORDER BY score DESC, submittedAt ASC",
  )
    .bind(id)
    .all();

  const rows = (results as any[]).map(submissionOut);
  const students = await lookup(c.env.DB, "users", rows.map((r) => r.student), [
    "name",
    "email",
  ]);

  // The class roster tells us who has NOT sat it yet, which is the thing a
  // teacher actually wants to know.
  const classRow = await c.env.DB.prepare("SELECT students FROM classes WHERE id = ?")
    .bind(exam.class)
    .first();
  const roster = parseJson<string[]>(classRow?.students, []);
  const submitted = new Set(rows.map((r) => r.student));
  const outstanding = roster.filter((sid) => !submitted.has(sid));
  const outstandingStudents = await lookup(c.env.DB, "users", outstanding, ["name", "email"]);

  const totalPoints = parseJson<any[]>(exam.questions, []).reduce(
    (sum, q) => sum + (Number(q.points) || 1),
    0,
  );
  const scores = rows.map((r) => Number(r.score) || 0);

  return c.json({
    exam: { _id: exam.id, title: exam.title, totalPoints },
    submissions: rows.map((r) => ({
      ...r,
      student: populated(students, r.student),
    })),
    outstanding: outstanding.map((sid) => outstandingStudents.get(sid) ?? sid),
    stats: {
      submitted: rows.length,
      outstanding: outstanding.length,
      average: scores.length
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : null,
      highest: scores.length ? Math.max(...scores) : null,
    },
  });
});

// DELETE /api/exams/:id — Private (Teacher & Admin).
// The Exams page has a delete button, but the old router never bound this.
exams.delete("/:id", protect, authorize(["teacher", "admin"]), async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT * FROM exams WHERE id = ?").bind(id).first();
  if (!row) return c.json({ message: "Exam not found" }, 404);
  if (user.role !== "admin" && row.teacher !== user._id) {
    return c.json({ message: "Not authorized to delete this exam" }, 403);
  }

  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM submissions WHERE exam = ?").bind(id),
    c.env.DB.prepare("DELETE FROM exam_attempts WHERE exam = ?").bind(id),
    c.env.DB.prepare("DELETE FROM exams WHERE id = ?").bind(id),
  ]);
  await logActivity(c.env, { userId: user._id, action: `Deleted exam: ${row.title}` });
  return c.json({ message: "Exam deleted successfully" });
});

// GET /api/exams/:id — Private. Registered last so it doesn't shadow the
// /:id/result and /:id/status routes above.
exams.get("/:id", protect, async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT * FROM exams WHERE id = ?")
    .bind(c.req.param("id"))
    .first();
  if (!row) return c.json({ message: "Exam not found" }, 404);

  if (!isStaff(user.role)) {
    if (row.class !== user.studentClass) {
      return c.json({ message: "You are not authorized to view this exam." }, 403);
    }
    // The list endpoint filters `isActive = 1`; this one only checked the class,
    // so a student who knew an id could read an unpublished paper — including
    // one still being drafted for them.
    if (row.isActive !== 1) {
      return c.json({ message: "This exam is not open yet." }, 403);
    }
  }

  const exam = examOut(row, { answers: canSeeAnswers(user.role) });

  // Opening the paper is what starts the clock. Staff previewing it are not
  // sitting it, so they never create an attempt.
  let attempt: ReturnType<typeof attemptWindow> | null = null;
  if (user.role === "student") {
    const already = await c.env.DB.prepare(
      "SELECT id FROM submissions WHERE exam = ? AND student = ?",
    )
      .bind(row.id, user._id)
      .first();
    if (!already) {
      const startedAt = await startAttempt(c.env.DB, String(row.id), user._id);
      attempt = attemptWindow(startedAt, Number(row.duration) || 60);
    }
  }
  const [subjectMap, classMap, teacherMap] = await Promise.all([
    lookup(c.env.DB, "subjects", [exam.subject], ["name", "code"]),
    lookup(c.env.DB, "classes", [exam.class], ["name"]),
    lookup(c.env.DB, "users", [exam.teacher], ["name", "email"]),
  ]);

  return c.json({
    ...exam,
    subject: populated(subjectMap, exam.subject),
    class: populated(classMap, exam.class),
    teacher: populated(teacherMap, exam.teacher),
    attempt,
  });
});

export default exams;
