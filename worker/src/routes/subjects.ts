import { Hono } from "hono";
import type { AppEnv } from "../types";
import { authorize, protect } from "../lib/auth";
import { logActivity, lookup, meta, paginate } from "../lib/db";
import { newId, now } from "../lib/ids";
import { subjectOut } from "../lib/rows";

const subjects = new Hono<AppEnv>();

// GET /api/subjects — Private (Admin & Teacher), teachers populated
subjects.get("/", protect, authorize(["admin", "teacher"]), async (c) => {
  const url = new URL(c.req.url);
  const { page, limit, offset } = paginate(url);
  const search = url.searchParams.get("search");

  const clause = search
    ? "WHERE (name LIKE ? COLLATE NOCASE OR code LIKE ? COLLATE NOCASE)"
    : "";
  const args = search ? [`%${search}%`, `%${search}%`] : [];

  const [countRow, list] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM subjects ${clause}`).bind(...args).first(),
    c.env.DB.prepare(
      `SELECT * FROM subjects ${clause} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
    )
      .bind(...args, limit, offset)
      .all(),
  ]);

  const rows = (list.results as any[]).map(subjectOut);
  const teachers = await lookup(
    c.env.DB,
    "users",
    rows.flatMap((r) => r.teacher),
    ["name", "email"],
  );

  return c.json({
    subjects: rows.map((r) => ({
      ...r,
      teacher: r.teacher.map((id: string) => teachers.get(id) ?? id),
    })),
    pagination: meta(Number(countRow?.total ?? 0), page, limit),
  });
});

// POST /api/subjects/create — Private/Admin
subjects.post("/create", protect, authorize(["admin"]), async (c) => {
  const { name, code, teacher, isActive } = await c.req.json<any>().catch(() => ({}));
  if (!name || !code) return c.json({ message: "name and code are required" }, 400);

  const exists = await c.env.DB.prepare("SELECT id FROM subjects WHERE code = ?")
    .bind(code)
    .first();
  if (exists) return c.json({ message: "Subject code already exists" }, 400);

  const ts = now();
  const id = newId();
  await c.env.DB.prepare(
    `INSERT INTO subjects (id, name, code, teacher, isActive, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      name,
      code,
      JSON.stringify(Array.isArray(teacher) ? teacher : []),
      isActive === false ? 0 : 1,
      ts,
      ts,
    )
    .run();

  await logActivity(c.env, {
    userId: c.get("user")._id,
    action: `Created subject: ${name}`,
  });

  const row = await c.env.DB.prepare("SELECT * FROM subjects WHERE id = ?").bind(id).first();
  return c.json(subjectOut(row!), 201);
});

// PUT|PATCH /api/subjects/update/:id — Private/Admin
subjects.on(["PUT", "PATCH"], "/update/:id", protect, authorize(["admin"]), async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM subjects WHERE id = ?").bind(id).first();
  if (!row) return c.json({ message: "Subject not found" }, 404);

  const body = await c.req.json<any>().catch(() => ({}));
  const name = body.name ?? row.name;
  const code = body.code ?? row.code;
  const isActive = body.isActive !== undefined ? (body.isActive ? 1 : 0) : row.isActive;
  const teacher = Array.isArray(body.teacher) ? JSON.stringify(body.teacher) : row.teacher;

  if (code !== row.code) {
    const clash = await c.env.DB.prepare("SELECT id FROM subjects WHERE code = ? AND id != ?")
      .bind(code, id)
      .first();
    if (clash) return c.json({ message: "Subject code already exists" }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE subjects SET name = ?, code = ?, teacher = ?, isActive = ?, updatedAt = ? WHERE id = ?`,
  )
    .bind(name, code, teacher, isActive, now(), id)
    .run();

  await logActivity(c.env, {
    userId: c.get("user")._id,
    action: `Updated subject: ${name}`,
  });

  const updated = await c.env.DB.prepare("SELECT * FROM subjects WHERE id = ?").bind(id).first();
  return c.json(subjectOut(updated!));
});

// DELETE /api/subjects/delete/:id — Private/Admin
subjects.delete("/delete/:id", protect, authorize(["admin"]), async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM subjects WHERE id = ?").bind(id).first();
  if (!row) return c.json({ message: "Subject not found" }, 404);

  await c.env.DB.prepare("DELETE FROM subjects WHERE id = ?").bind(id).run();
  await logActivity(c.env, {
    userId: c.get("user")._id,
    action: `Deleted subject: ${row.name}`,
  });
  return c.json({ message: "Subject deleted successfully" });
});

export default subjects;
