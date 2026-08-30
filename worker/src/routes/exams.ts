import { Hono } from "hono";
import type { AppEnv } from "../types";
import { authorize, protect } from "../lib/auth";
import { logActivity, lookup, populated } from "../lib/db";
import { newId, now } from "../lib/ids";
import { examOut, parseJson, submissionOut } from "../lib/rows";
import { generateExamJob, gradeSubmission } from "../jobs";

const exams = new Hono<AppEnv>();

const canSeeAnswers = (role: string) => role === "teacher" || role === "admin";

// POST /api/exams/generate — Private (Teacher & Admin)
exams.post("/generate", protect, authorize(["teacher", "admin"]), async (c) => {
  const body = await c.req.json<any>().catch(() => ({}));
  const { title, subject, class: classId, duration, dueDate, topic, difficulty, count } = body;

  if (!subject || !classId || !topic) {
    return c.json({ message: "subject, class and topic are required" }, 400);
  }

  const subjectRow = await c.env.DB.prepare("SELECT * FROM subjects WHERE id = ?")
    .bind(subject)
    .first();
  if (!subjectRow) return c.json({ message: "Subject not found" }, 404);

  const teacherId = c.get("user")._id;
  const ts = now();
  const examId = newId();
  const due = dueDate
    ? new Date(dueDate).toISOString()
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

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
      Number(duration) || 60,
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
      count: Number(count) || 10,
    }),
  );

  return c.json({ message: "Exam generation started.", examId }, 202);
});

// POST /api/exams — Private (Teacher & Admin), manual create
exams.post("/", protect, authorize(["teacher", "admin"]), async (c) => {
  const body = await c.req.json<any>().catch(() => ({}));
  const { title, subject, class: classId, duration, dueDate, isActive, questions } = body;
  if (!title || !subject || !classId) {
    return c.json({ message: "title, subject and class are required" }, 400);
  }

  const ts = now();
  const examId = newId();
  const withIds = (Array.isArray(questions) ? questions : []).map((q: any) => ({
    _id: q._id ?? newId(),
    questionText: String(q.questionText ?? ""),
    type: q.type === "SHORT_ANSWER" ? "SHORT_ANSWER" : "MCQ",
    options: Array.isArray(q.options) ? q.options.map(String) : [],
    correctAnswer: String(q.correctAnswer ?? ""),
    points: Number(q.points) || 1,
  }));

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
      Number(duration) || 60,
      dueDate
        ? new Date(dueDate).toISOString()
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
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
  sql += " ORDER BY createdAt DESC";

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
  const studentId = canSeeAnswers(user.role)
    ? (new URL(c.req.url).searchParams.get("student") ?? user._id)
    : user._id;

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
    const result = await gradeSubmission(c.env, {
      examId: c.req.param("id"),
      studentId: user._id,
      answers,
    });
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
    const message = error?.message ?? "Submission failed";
    return c.json({ message }, message === "Exam already submitted" ? 400 : 500);
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

  if (user.role === "student" && row.class !== user.studentClass) {
    return c.json({ message: "You are not authorized to view this exam." }, 403);
  }

  const exam = examOut(row, { answers: canSeeAnswers(user.role) });
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
  });
});

export default exams;
