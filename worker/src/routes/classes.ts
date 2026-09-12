import { Hono } from "hono";
import type { AppEnv } from "../types";
import { authorize, protect } from "../lib/auth";
import { countReferences, logActivity, lookup, meta, paginate, populated } from "../lib/db";
import { newId, now } from "../lib/ids";
import { classOut } from "../lib/rows";
import { parseInt_, parseString } from "../lib/validate";

const classes = new Hono<AppEnv>();

// GET /api/classes — Private/Admin, academicYear + classTeacher populated
// Teachers need to read the class list: the AI quiz dialog and the timetable
// class picker both load it. Admin-only, the dialog's Promise.all failed as a
// whole and a teacher saw empty Subject and Class dropdowns, so no teacher could
// generate a quiz at all. Writes stay admin-only below.
classes.get("/", protect, authorize(["admin", "teacher"]), async (c) => {
  const url = new URL(c.req.url);
  const { page, limit, offset } = paginate(url);
  const search = url.searchParams.get("search");

  const clause = search ? "WHERE name LIKE ? COLLATE NOCASE" : "";
  const args = search ? [`%${search}%`] : [];

  const [countRow, list] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM classes ${clause}`).bind(...args).first(),
    c.env.DB.prepare(
      `SELECT * FROM classes ${clause} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
    )
      .bind(...args, limit, offset)
      .all(),
  ]);

  const rows = (list.results as any[]).map(classOut);
  const [yearMap, teacherMap] = await Promise.all([
    lookup(c.env.DB, "academic_years", rows.map((r) => r.academicYear), ["name"]),
    lookup(c.env.DB, "users", rows.map((r) => r.classTeacher), ["name", "email"]),
  ]);

  return c.json({
    classes: rows.map((r) => ({
      ...r,
      academicYear: populated(yearMap, r.academicYear),
      classTeacher: populated(teacherMap, r.classTeacher),
    })),
    pagination: meta(Number(countRow?.total ?? 0), page, limit),
  });
});

// POST /api/classes/create — Private/Admin
classes.post("/create", protect, authorize(["admin"]), async (c) => {
  const body = await c.req.json<any>().catch(() => ({}));
  const { academicYear, classTeacher, capacity, subjects, students } = body;
  if (!body.name || !academicYear) {
    return c.json({ message: "name and academicYear are required" }, 400);
  }
  const name = parseString(body.name, "name", { max: 120 });
  const size = parseInt_(capacity, "capacity", { min: 1, max: 1000, fallback: 40 });

  // Nothing enforced this, so a class could point at an academic year that does
  // not exist and the UI would render a raw hex id where the year should be.
  const yearRow = await c.env.DB.prepare("SELECT id FROM academic_years WHERE id = ?")
    .bind(academicYear)
    .first();
  if (!yearRow) return c.json({ message: "Academic year not found" }, 404);

  const exists = await c.env.DB.prepare(
    "SELECT id FROM classes WHERE name = ? AND academicYear = ?",
  )
    .bind(name, academicYear)
    .first();
  if (exists) {
    return c.json(
      { message: "Class with this name already exists for the specified academic year." },
      400,
    );
  }

  const ts = now();
  const id = newId();
  await c.env.DB.prepare(
    `INSERT INTO classes (id, name, academicYear, classTeacher, subjects, students, capacity, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      name,
      academicYear,
      classTeacher || null,
      JSON.stringify(Array.isArray(subjects) ? subjects : []),
      JSON.stringify(Array.isArray(students) ? students : []),
      size,
      ts,
      ts,
    )
    .run();

  await logActivity(c.env, {
    userId: c.get("user")._id,
    action: `Created new class: ${name}`,
  });

  const row = await c.env.DB.prepare("SELECT * FROM classes WHERE id = ?").bind(id).first();
  return c.json(classOut(row!), 201);
});

// PUT|PATCH /api/classes/update/:id — Private/Admin.
// The UI sends PUT here while the old router only bound PATCH; accept both.
classes.on(["PUT", "PATCH"], "/update/:id", protect, authorize(["admin"]), async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM classes WHERE id = ?").bind(id).first();
  if (!row) return c.json({ message: "Class not found" }, 404);

  const body = await c.req.json<any>().catch(() => ({}));
  const name = body.name ?? row.name;
  const academicYear = body.academicYear ?? row.academicYear;
  const classTeacher =
    body.classTeacher !== undefined ? body.classTeacher || null : row.classTeacher;
  const subjects = Array.isArray(body.subjects) ? JSON.stringify(body.subjects) : row.subjects;
  const students = Array.isArray(body.students) ? JSON.stringify(body.students) : row.students;
  const capacity =
    body.capacity !== undefined
      ? parseInt_(body.capacity, "capacity", { min: 1, max: 1000 })
      : row.capacity;

  // The unique index is (name, academicYear) — check before we hit it.
  if (name !== row.name || academicYear !== row.academicYear) {
    const clash = await c.env.DB.prepare(
      "SELECT id FROM classes WHERE name = ? AND academicYear = ? AND id != ?",
    )
      .bind(name, academicYear, id)
      .first();
    if (clash) {
      return c.json(
        { message: "Class with this name already exists for the specified academic year." },
        400,
      );
    }
  }

  await c.env.DB.prepare(
    `UPDATE classes SET name = ?, academicYear = ?, classTeacher = ?, subjects = ?,
       students = ?, capacity = ?, updatedAt = ?
     WHERE id = ?`,
  )
    .bind(name, academicYear, classTeacher, subjects, students, capacity, now(), id)
    .run();

  await logActivity(c.env, {
    userId: c.get("user")._id,
    action: `Updated class: ${name}`,
  });

  const updated = await c.env.DB.prepare("SELECT * FROM classes WHERE id = ?").bind(id).first();
  return c.json(classOut(updated!));
});

// DELETE /api/classes/delete/:id — Private/Admin
classes.delete("/delete/:id", protect, authorize(["admin"]), async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM classes WHERE id = ?").bind(id).first();
  if (!row) return c.json({ message: "Class not found" }, 404);

  const examCount = await countReferences(c.env.DB, "exams", "class", id);
  if (examCount > 0) {
    return c.json(
      {
        message: `This class has ${examCount} exam${examCount === 1 ? "" : "s"}. Delete them first.`,
      },
      409,
    );
  }

  // Students would otherwise keep pointing at a class that no longer exists,
  // which silently hides every exam from them.
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE users SET studentClass = NULL, updatedAt = ? WHERE studentClass = ?",
    ).bind(now(), id),
    c.env.DB.prepare("DELETE FROM timetables WHERE class = ?").bind(id),
    c.env.DB.prepare("DELETE FROM classes WHERE id = ?").bind(id),
  ]);

  await logActivity(c.env, {
    userId: c.get("user")._id,
    action: `Deleted class: ${row.name}`,
  });
  return c.json({ message: "Class removed" });
});

export default classes;
