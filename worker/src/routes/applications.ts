import { Hono } from "hono";
import type { AppEnv } from "../types";
import { authorize, protect } from "../lib/auth";
import { logActivity, meta, paginate } from "../lib/db";
import { newId, now } from "../lib/ids";
import type { Row } from "../lib/rows";

const applications = new Hono<AppEnv>();

const STATUSES = ["pending", "reviewing", "accepted", "rejected"] as const;

const applicationOut = (row: Row): Row => {
  const { id, ...rest } = row;
  return { _id: id, ...rest };
};

// POST /api/applications — PUBLIC. This is the one write path on the whole API
// that does not require a session: it backs the "Apply Now" page.
applications.post("/", async (c) => {
  const body = await c.req.json<any>().catch(() => ({}));
  const fullName = String(body.fullName ?? "").trim();
  const email = String(body.email ?? "").trim();
  const program = String(body.program ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const message = String(body.message ?? "").trim();

  if (!fullName || !email || !program) {
    return c.json({ message: "Full name, email and program are required" }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ message: "Please enter a valid email address" }, 400);
  }
  // Cheap guards against someone pasting a novel into an unauthenticated endpoint.
  if (fullName.length > 120 || email.length > 200 || program.length > 120 || message.length > 2000) {
    return c.json({ message: "One of the fields is too long" }, 400);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM applications WHERE lower(email) = lower(?) AND program = ? AND status = 'pending'",
  )
    .bind(email, program)
    .first();
  if (existing) {
    return c.json(
      { message: "You already have a pending application for this program.", _id: existing.id },
      409,
    );
  }

  const ts = now();
  const id = newId();
  await c.env.DB.prepare(
    `INSERT INTO applications (id, fullName, email, phone, program, message, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
  )
    .bind(id, fullName, email, phone || null, program, message || null, ts, ts)
    .run();

  return c.json(
    {
      _id: id,
      message: "Application received. Our admissions team will be in touch by email.",
    },
    201,
  );
});

// GET /api/applications — Private/Admin
applications.get("/", protect, authorize(["admin"]), async (c) => {
  const url = new URL(c.req.url);
  const { page, limit, offset } = paginate(url);
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("search");

  const where: string[] = [];
  const args: unknown[] = [];
  if (status && status !== "all") {
    where.push("status = ?");
    args.push(status);
  }
  if (search) {
    where.push("(fullName LIKE ? COLLATE NOCASE OR email LIKE ? COLLATE NOCASE)");
    args.push(`%${search}%`, `%${search}%`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [countRow, list] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM applications ${clause}`).bind(...args).first(),
    c.env.DB.prepare(
      `SELECT * FROM applications ${clause} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
    )
      .bind(...args, limit, offset)
      .all(),
  ]);

  return c.json({
    applications: (list.results as Row[]).map(applicationOut),
    pagination: meta(Number(countRow?.total ?? 0), page, limit),
  });
});

// PATCH /api/applications/:id — Private/Admin, move it through the pipeline
applications.on(["PUT", "PATCH"], "/:id", protect, authorize(["admin"]), async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM applications WHERE id = ?").bind(id).first();
  if (!row) return c.json({ message: "Application not found" }, 404);

  const { status } = await c.req.json<any>().catch(() => ({}));
  if (!STATUSES.includes(status)) {
    return c.json({ message: `status must be one of: ${STATUSES.join(", ")}` }, 400);
  }

  await c.env.DB.prepare("UPDATE applications SET status = ?, updatedAt = ? WHERE id = ?")
    .bind(status, now(), id)
    .run();
  await logActivity(c.env, {
    userId: c.get("user")._id,
    action: `Marked application from ${row.email} as ${status}`,
  });

  const updated = await c.env.DB.prepare("SELECT * FROM applications WHERE id = ?")
    .bind(id)
    .first();
  return c.json(applicationOut(updated!));
});

// DELETE /api/applications/:id — Private/Admin
applications.delete("/:id", protect, authorize(["admin"]), async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM applications WHERE id = ?").bind(id).first();
  if (!row) return c.json({ message: "Application not found" }, 404);

  await c.env.DB.prepare("DELETE FROM applications WHERE id = ?").bind(id).run();
  await logActivity(c.env, {
    userId: c.get("user")._id,
    action: `Deleted application from ${row.email}`,
  });
  return c.json({ message: "Application deleted successfully" });
});

export default applications;
