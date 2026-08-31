import { Hono } from "hono";
import type { AppEnv, Role } from "../types";
import { authorize, clearToken, issueToken, optionalAuth, protect } from "../lib/auth";
import { hashPassword, verifyPassword } from "../lib/password";
import { logActivity, meta, paginate } from "../lib/db";
import { newId, now } from "../lib/ids";
import { userOut } from "../lib/rows";

const users = new Hono<AppEnv>();

// The React forms enforce this, but forms are a convenience — anything talking
// to the API directly used to get through with a one-character password.
const MIN_PASSWORD_LENGTH = 8;

// POST /api/users/register — Private (Admin & Teacher)
users.post("/register", protect, authorize(["admin", "teacher"]), async (c) => {
  const body = await c.req.json<any>().catch(() => ({}));
  const { name, email, password, role, studentClass, teacherSubject, isActive } = body;

  if (!name || !email || !password) {
    return c.json({ message: "name, email and password are required" }, 400);
  }
  if (String(password).length < MIN_PASSWORD_LENGTH) {
    return c.json(
      { message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      400,
    );
  }

  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE lower(email) = lower(?)")
    .bind(email)
    .first();
  if (existing) return c.json({ message: "User already exists" }, 400);

  const ts = now();
  const id = newId();
  await c.env.DB.prepare(
    `INSERT INTO users (id, name, email, password, role, isActive, studentClass, teacherSubject, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      name,
      email,
      await hashPassword(password),
      (role as Role) || "student",
      isActive === false ? 0 : 1,
      studentClass || null,
      JSON.stringify(Array.isArray(teacherSubject) ? teacherSubject : []),
      ts,
      ts,
    )
    .run();

  await logActivity(c.env, {
    userId: c.get("user")._id,
    action: "Registered User",
    details: `Registered user with email: ${email}`,
  });

  const row = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  return c.json({ ...userOut(row!), message: "User registered successfully" }, 201);
});

// POST /api/users/login — Public
users.post("/login", async (c) => {
  const { email, password } = await c.req.json<any>().catch(() => ({}));
  if (!email || !password) {
    return c.json({ message: "Invalid email or password" }, 401);
  }

  const row = await c.env.DB.prepare("SELECT * FROM users WHERE lower(email) = lower(?)")
    .bind(email)
    .first();
  if (!row || !(await verifyPassword(password, row.password as string))) {
    return c.json({ message: "Invalid email or password" }, 401);
  }
  if (row.isActive !== 1) {
    return c.json({ message: "This account has been deactivated" }, 403);
  }

  await issueToken(c, row.id as string);
  return c.json(userOut(row));
});

// POST /api/users/logout — Public
users.post("/logout", (c) => {
  clearToken(c);
  return c.json({ message: "Logged out successfully" });
});

// GET /api/users/profile — answers for signed-out callers too.
// This is a "who am I" probe the SPA runs on every page load, including the
// public landing page. Behind `protect` it 401'd for every visitor, so it
// returns 200 with a null user instead — absence of a session is the answer,
// not a failure.
users.get("/profile", optionalAuth, (c) => {
  const user = c.get("user");
  if (!user) return c.json({ user: null });
  return c.json({
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      studentClass: user.studentClass,
      teacherSubject: user.teacherSubject,
    },
  });
});

// GET /api/users — Private (Admin & Teacher), paginated + filterable
users.get("/", protect, authorize(["admin", "teacher"]), async (c) => {
  const url = new URL(c.req.url);
  const { page, limit, offset } = paginate(url);
  const role = url.searchParams.get("role");
  const search = url.searchParams.get("search");

  const where: string[] = [];
  const args: unknown[] = [];
  if (role && role !== "all") {
    where.push("role = ?");
    args.push(role);
  }
  if (search) {
    where.push("(name LIKE ? COLLATE NOCASE OR email LIKE ? COLLATE NOCASE)");
    args.push(`%${search}%`, `%${search}%`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [countRow, list] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM users ${clause}`).bind(...args).first(),
    c.env.DB.prepare(
      `SELECT * FROM users ${clause} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
    )
      .bind(...args, limit, offset)
      .all(),
  ]);

  return c.json({
    users: (list.results as any[]).map((r) => userOut(r)),
    pagination: meta(Number(countRow?.total ?? 0), page, limit),
  });
});

// PUT /api/users/update/:id — Private (Admin & Teacher)
users.put("/update/:id", protect, authorize(["admin", "teacher"]), async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  if (!row) return c.json({ message: "User not found" }, 404);

  const body = await c.req.json<any>().catch(() => ({}));
  const name = body.name ?? row.name;
  const email = body.email ?? row.email;
  const role = body.role ?? row.role;
  const isActive = body.isActive !== undefined ? (body.isActive ? 1 : 0) : row.isActive;
  const studentClass = body.studentClass ?? row.studentClass;
  const teacherSubject = Array.isArray(body.teacherSubject)
    ? JSON.stringify(body.teacherSubject)
    : row.teacherSubject;
  if (body.password && String(body.password).length < MIN_PASSWORD_LENGTH) {
    return c.json(
      { message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      400,
    );
  }
  if (String(email).toLowerCase() !== String(row.email).toLowerCase()) {
    const clash = await c.env.DB.prepare(
      "SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?",
    )
      .bind(email, id)
      .first();
    if (clash) {
      return c.json({ message: "Another account already uses that email" }, 400);
    }
  }

  const password = body.password
    ? await hashPassword(body.password)
    : (row.password as string);

  await c.env.DB.prepare(
    `UPDATE users SET name = ?, email = ?, password = ?, role = ?, isActive = ?,
       studentClass = ?, teacherSubject = ?, updatedAt = ?
     WHERE id = ?`,
  )
    .bind(name, email, password, role, isActive, studentClass, teacherSubject, now(), id)
    .run();

  await logActivity(c.env, {
    userId: c.get("user")._id,
    action: "Updated User",
    details: `Updated user with email: ${email}`,
  });

  const updated = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  return c.json({ ...userOut(updated!), message: "User updated successfully" });
});

// DELETE /api/users/delete/:id — Private (Admin & Teacher)
users.delete("/delete/:id", protect, authorize(["admin", "teacher"]), async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  if (!row) return c.json({ message: "User not found" }, 404);
  if (id === c.get("user")._id) {
    return c.json({ message: "You cannot delete your own account" }, 400);
  }

  await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
  await logActivity(c.env, {
    userId: c.get("user")._id,
    action: "Deleted User",
    details: `Deleted user with email: ${row.email}`,
  });
  return c.json({ message: "User deleted successfully" });
});

export default users;
