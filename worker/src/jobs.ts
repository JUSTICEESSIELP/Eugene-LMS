import type { Env } from "./types";
import { generateJson } from "./lib/ai";
import { newId, now } from "./lib/ids";
import { parseJson } from "./lib/rows";

/**
 * These two ran as Inngest functions against a hosted Inngest instance. On
 * Workers they run inside `ctx.waitUntil()` after the request has already been
 * answered with 202, which keeps the API contract the frontend expects while
 * dropping the external dependency. Progress is tracked in the row's `status`
 * column instead of Inngest's dashboard.
 */

export interface GenSettings {
  startTime: string;
  endTime: string;
  periods: number;
}

const fail = async (env: Env, table: string, id: string, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${table} job ${id} failed:`, message);
  await env.DB.prepare(`UPDATE ${table} SET status = 'failed', error = ?, updatedAt = ? WHERE id = ?`)
    .bind(message.slice(0, 500), now(), id)
    .run();
};

export const generateTimetableJob = async (
  env: Env,
  {
    timetableId,
    classId,
    academicYearId,
    settings,
  }: {
    timetableId: string;
    classId: string;
    academicYearId: string;
    settings: GenSettings;
  },
) => {
  try {
    const classRow = await env.DB.prepare("SELECT * FROM classes WHERE id = ?")
      .bind(classId)
      .first();
    if (!classRow) throw new Error("Class not found");

    const subjectIds = parseJson<string[]>(classRow.subjects, []);
    if (subjectIds.length === 0) {
      throw new Error("No Subjects assigned to this class");
    }

    const placeholders = subjectIds.map(() => "?").join(", ");
    const { results: subjectRows } = await env.DB.prepare(
      `SELECT id, name, code FROM subjects WHERE id IN (${placeholders})`,
    )
      .bind(...subjectIds)
      .all();

    const { results: teacherRows } = await env.DB.prepare(
      "SELECT id, name, teacherSubject FROM users WHERE role = 'teacher'",
    ).all();

    // Only teachers who actually teach one of this class's subjects.
    const qualifiedTeachers = (teacherRows as any[])
      .map((t) => ({
        id: t.id,
        name: t.name,
        subjects: parseJson<string[]>(t.teacherSubject, []),
      }))
      .filter((t) => t.subjects.some((s) => subjectIds.includes(s)));

    if (qualifiedTeachers.length === 0) {
      throw new Error("No Teachers assigned to these class subjects");
    }

    // Other classes' schedules, so the model can avoid double-booking teachers.
    const { results: otherTimetables } = await env.DB.prepare(
      "SELECT class, schedule FROM timetables WHERE academicYear = ? AND id != ? AND status = 'ready'",
    )
      .bind(academicYearId, timetableId)
      .all();

    const subjects = (subjectRows as any[]).map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
    }));

    const prompt = `
You are a school scheduler. Generate a weekly timetable (Monday to Friday).

CONTEXT:
- Class: ${classRow.name}
- Hours: ${settings.startTime} to ${settings.endTime} (${settings.periods} periods/day).

RESOURCES:
- Subjects: ${JSON.stringify(subjects)}
- Teachers: ${JSON.stringify(qualifiedTeachers)}
- Other Timetables: ${JSON.stringify(
      (otherTimetables as any[]).map((t) => ({
        class: t.class,
        schedule: parseJson<any[]>(t.schedule, []),
      })),
    )}

STRICT RULES:
1. Assign a Teacher to every Subject period.
2. The Teacher MUST have that subject id in their "subjects" list.
3. Break/Free Period after every 2 periods (10 minutes); Lunch after 5 periods (at 12:00, 30 minutes).
4. Avoid clashes with the other timetables — a teacher cannot be in two classes at the same time.
5. "subject" and "teacher" MUST be the exact id strings given above.
6. Output strict JSON only. Schema:
   {
     "schedule": [
       {
         "day": "Monday",
         "periods": [
           { "subject": "SUBJECT_ID", "teacher": "TEACHER_ID", "startTime": "HH:MM", "endTime": "HH:MM" }
         ]
       }
     ]
   }
`.trim();

    const result = await generateJson<{ schedule: any[] }>(env, prompt);
    const schedule = Array.isArray(result?.schedule) ? result.schedule : [];
    if (schedule.length === 0) throw new Error("The model returned an empty schedule");

    await env.DB.prepare(
      "UPDATE timetables SET schedule = ?, status = 'ready', error = NULL, updatedAt = ? WHERE id = ?",
    )
      .bind(JSON.stringify(schedule), now(), timetableId)
      .run();
  } catch (error) {
    await fail(env, "timetables", timetableId, error);
  }
};

export const generateExamJob = async (
  env: Env,
  {
    examId,
    topic,
    subjectName,
    difficulty,
    count,
  }: {
    examId: string;
    topic: string;
    subjectName: string;
    difficulty: string;
    count: number;
  },
) => {
  try {
    const prompt = `
You are a strict teacher. Create a JSON array of ${count} multiple-choice questions for a high school exam.

CONTEXT:
- Subject: ${subjectName}
- Topic: ${topic}
- Difficulty: ${difficulty}

STRICT JSON SCHEMA (Array of Objects):
[
  {
    "questionText": "Question string",
    "type": "MCQ",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "The exact string of the correct option",
    "points": 1
  }
]

RULES:
1. Output ONLY raw JSON. No Markdown.
2. correctAnswer must match one of the options exactly.
`.trim();

    const raw = await generateJson<any>(env, prompt);
    const list: any[] = Array.isArray(raw) ? raw : (raw?.questions ?? []);
    if (list.length === 0) throw new Error("The model returned no questions");

    // Each question needs its own id — the frontend keys answers by it.
    const questions = list.map((q) => ({
      _id: newId(),
      questionText: String(q.questionText ?? ""),
      type: q.type === "SHORT_ANSWER" ? "SHORT_ANSWER" : "MCQ",
      options: Array.isArray(q.options) ? q.options.map(String) : [],
      correctAnswer: String(q.correctAnswer ?? ""),
      points: Number(q.points) || 1,
    }));

    await env.DB.prepare(
      `UPDATE exams SET questions = ?, isActive = 0, status = 'ready', error = NULL, updatedAt = ?
       WHERE id = ?`,
    )
      .bind(JSON.stringify(questions), now(), examId)
      .run();
  } catch (error) {
    await fail(env, "exams", examId, error);
  }
};

/**
 * Grading ran through Inngest too, to keep it off the request path. It is a
 * handful of string comparisons, so on Workers it just runs inline.
 */
/** Thrown for a submission the student should not be allowed to make. */
export class SubmissionNotAllowed extends Error {}

export const gradeSubmission = async (
  env: Env,
  {
    examId,
    studentId,
    answers,
  }: { examId: string; studentId: string; answers: any[] },
  actor?: { role: string; studentClass: string | null },
) => {
  const existing = await env.DB.prepare(
    "SELECT id FROM submissions WHERE exam = ? AND student = ?",
  )
    .bind(examId, studentId)
    .first();
  if (existing) throw new SubmissionNotAllowed("Exam already submitted");

  const exam = await env.DB.prepare("SELECT * FROM exams WHERE id = ?").bind(examId).first();
  if (!exam) throw new Error(`Exam ${examId} not found`);

  // GET /exams/:id already refuses a student from another class, but this path
  // used to grade anything it was handed — so a student could post a
  // submission against another class's paper, an unpublished draft, or an
  // exam long past due. Same rules, both paths.
  if (actor && actor.role === "student") {
    if (exam.class !== actor.studentClass) {
      throw new SubmissionNotAllowed("This exam is not assigned to your class");
    }
    if (exam.isActive !== 1) {
      throw new SubmissionNotAllowed("This exam is not open for submissions");
    }
    if (exam.dueDate && new Date(exam.dueDate as string).getTime() < Date.now()) {
      throw new SubmissionNotAllowed("The due date for this exam has passed");
    }
  }

  const questions = parseJson<any[]>(exam.questions, []);
  const given = Array.isArray(answers) ? answers : [];

  let score = 0;
  let totalPoints = 0;
  for (const question of questions) {
    const points = Number(question.points) || 1;
    totalPoints += points;
    const answer = given.find((a) => a?.questionId === question._id);
    if (answer && answer.answer === question.correctAnswer) score += points;
  }

  const id = newId();
  await env.DB.prepare(
    `INSERT INTO submissions (id, exam, student, answers, score, totalPoints, submittedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, examId, studentId, JSON.stringify(given), score, totalPoints, now())
    .run();

  return { id, score, totalPoints };
};
