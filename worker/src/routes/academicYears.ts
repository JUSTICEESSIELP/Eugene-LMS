import { Hono } from "hono";
import type { AppEnv } from "../types";
import { authorize, protect } from "../lib/auth";
import { countReferences, logActivity, meta, paginate } from "../lib/db";
import { newId, now } from "../lib/ids";
import { academicYearOut } from "../lib/rows";
import { parseDate, parseString } from "../lib/validate";

const years = new Hono<AppEnv>();

// GET /api/academic-years — Private/Admin
years.get("/", protect, authorize(["admin"]), async (c) => {
  const url = new URL(c.req.url);
  const { page, limit, offset } = paginate(url);
  const search = url.searchParams.get("search");

  const clause = search ? "WHERE name LIKE ? COLLATE NOCASE" : "";
  const args = search ? [`%${search}%`] : [];

  const [countRow, list] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM academic_years ${clause}`)
      .bind(...args)
      .first(),
    c.env.DB.prepare(
      `SELECT * FROM academic_years ${clause} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
    )
      .bind(...args, limit, offset)
      .all(),
  ]);

  return c.json({
    years: (list.results as any[]).map(academicYearOut),
    pagination: meta(Number(countRow?.total ?? 0), page, limit),
  });
});

// GET /api/academic-years/current — Private
years.get("/current", protect, async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT * FROM academic_years WHERE isCurrent = 1 LIMIT 1",
  ).first();
  if (!row) return c.json({ message: "No current academic year found" }, 404);
  return c.json(academicYearOut(row));
});

// POST /api/academic-years/create — Private/Admin
years.post("/create", protect, authorize(["admin"]), async (c) => {
  const body = await c.req.json<any>().catch(() => ({}));
  const { fromYear, toYear, isCurrent } = body;
  if (!body.name || !fromYear || !toYear) {
    return c.json({ message: "name, fromYear and toYear are required" }, 400);
  }
  const name = parseString(body.name, "name", { max: 120 });

  // `new Date("nonsense").toISOString()` throws RangeError, which reached the
  // client as a 500 carrying "Invalid time value".
  const from = parseDate(fromYear, "fromYear");
  const to = parseDate(toYear, "toYear");
  if (new Date(to).getTime() <= new Date(from).getTime()) {
    return c.json({ message: "toYear must be after fromYear" }, 400);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM academic_years WHERE fromYear = ? AND toYear = ?",
  )
    .bind(from, to)
    .first();
  if (existing) return c.json({ message: "Academic Year already exists" }, 400);

  // Only one year can be current at a time.
  if (isCurrent) {
    await c.env.DB.prepare("UPDATE academic_years SET isCurrent = 0").run();
  }

  const ts = now();
  const id = newId();
  await c.env.DB.prepare(
    `INSERT INTO academic_years (id, name, fromYear, toYear, isCurrent, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, name, from, to, isCurrent ? 1 : 0, ts, ts)
    .run();

  await logActivity(c.env, {
    userId: c.get("user")._id,
    action: `Created academic year ${name}`,
  });

  const row = await c.env.DB.prepare("SELECT * FROM academic_years WHERE id = ?")
    .bind(id)
    .first();
  return c.json(academicYearOut(row!), 201);
});

// PUT|PATCH /api/academic-years/update/:id — Private/Admin
years.on(["PUT", "PATCH"], "/update/:id", protect, authorize(["admin"]), async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM academic_years WHERE id = ?")
    .bind(id)
    .first();
  if (!row) return c.json({ message: "Academic Year not found" }, 404);

  const body = await c.req.json<any>().catch(() => ({}));
  if (body.isCurrent) {
    await c.env.DB.prepare("UPDATE academic_years SET isCurrent = 0 WHERE id != ?")
      .bind(id)
      .run();
  }

  const name =
    body.name !== undefined ? parseString(body.name, "name", { max: 120 }) : row.name;
  const fromYear = body.fromYear ? parseDate(body.fromYear, "fromYear") : row.fromYear;
  const toYear = body.toYear ? parseDate(body.toYear, "toYear") : row.toYear;
  const isCurrent = body.isCurrent !== undefined ? (body.isCurrent ? 1 : 0) : row.isCurrent;

  // Unsetting the only current year strands every non-admin: the SPA refuses to
  // render without one. Refuse rather than half-configure the school.
  if (row.isCurrent === 1 && isCurrent === 0) {
    const other = await c.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM academic_years WHERE isCurrent = 1 AND id != ?",
    )
      .bind(id)
      .first();
    if (Number(other?.total ?? 0) === 0) {
      return c.json(
        { message: "Make another year current first — the school needs exactly one." },
        400,
      );
    }
  }

  await c.env.DB.prepare(
    `UPDATE academic_years SET name = ?, fromYear = ?, toYear = ?, isCurrent = ?, updatedAt = ?
     WHERE id = ?`,
  )
    .bind(name, fromYear, toYear, isCurrent, now(), id)
    .run();

  await logActivity(c.env, {
    userId: c.get("user")._id,
    action: `Updated academic year ${name}`,
  });

  const updated = await c.env.DB.prepare("SELECT * FROM academic_years WHERE id = ?")
    .bind(id)
    .first();
  return c.json(academicYearOut(updated!));
});

// DELETE /api/academic-years/delete/:id — Private/Admin
years.delete("/delete/:id", protect, authorize(["admin"]), async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM academic_years WHERE id = ?")
    .bind(id)
    .first();
  if (!row) return c.json({ message: "Academic Year not found" }, 404);
  if (row.isCurrent === 1) {
    return c.json({ message: "Cannot delete the current academic year" }, 400);
  }

  const classCount = await countReferences(c.env.DB, "classes", "academicYear", id);
  if (classCount > 0) {
    return c.json(
      {
        message: `${classCount} class${classCount === 1 ? "" : "es"} still belong to this year. Delete them first.`,
      },
      409,
    );
  }

  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM timetables WHERE academicYear = ?").bind(id),
    c.env.DB.prepare("DELETE FROM academic_years WHERE id = ?").bind(id),
  ]);
  await logActivity(c.env, {
    userId: c.get("user")._id,
    action: `Deleted academic year ${row.name}`,
  });
  return c.json({ message: "Academic Year deleted successfully" });
});

export default years;
