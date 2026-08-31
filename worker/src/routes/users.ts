import { Hono } from "hono";
import type { AppEnv, Role } from "../types";
import {
  authorize,
  clearToken,
  issueToken,
  optionalAuth,
  protect,
  revokeSessions,
} from "../lib/auth";
import { hashPassword, verifyPassword } from "../lib/password";
import { logActivity, lookup, meta, paginate, pullFromJsonArray } from "../lib/db";
import { newId, now } from "../lib/ids";
import { userOut } from "../lib/rows";
import { sendPasswordResetEmail } from "../lib/email";
import { BadRequest, isEmail, isRole, parseString } from "../lib/validate";

const users = new Hono<AppEnv>();

// The React forms enforce this, but forms are a convenience — anything talking
// to the API directly used to get through with a one-character password.
const MIN_PASSWORD_LENGTH = 8;

const clientIp = (c: { req: { header(name: string): string | undefined } }) =>
  c.req.header("CF-Connecting-IP") ?? "anon";

/**
 * Who may act on whom.
 *
 * `authorize(["admin","teacher"])` was the only gate on register, update and
 * delete, and every one of them took `role` straight off the body. So a teacher
 * could mint an admin, promote themselves, or overwrite the admin's password
 * and sign in as them — the whole role system came apart at the first teacher
 * account. Teachers keep the thing they actually need (managing students) and
 * nothing above it.
 */
const canActOn = (actor: Role, targetRole: Role): boolean =>
  actor === "admin" || (actor === "teacher" && targetRole === "student");

/** Everyone may edit their own name, email and password — but not their role. */
const isSelf = (actorId: string, targetId: string) => actorId === targetId;

/** The role an actor is allowed to *assign*. Teachers may only make students. */
const assertAssignableRole = (actor: Role, requested: unknown): Role => {
  const role: Role = requested === undefined || requested === null ? "student" : (requested as Role);
  if (!isRole(role)) {
    throw new BadRequest("role must be one of: admin, teacher, student, parent");
  }
  if (!canActOn(actor, role)) {
    throw new BadRequest(`A ${actor} cannot create or assign the '${role}' role`);
  }
  return role;
};

/**
 * Refuses a change that would leave the system with no way back in — the last
 * active admin demoting, deactivating or deleting themselves.
 */
const assertNotLastAdmin = async (
  db: D1Database,
  targetId: string,
  targetRole: string,
  stillAdmin: boolean,
) => {
  if (targetRole !== "admin" || stillAdmin) return;
  const row = await db
    .prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND isActive = 1 AND id != ?")
    .bind(targetId)
    .first();
  if (Number(row?.total ?? 0) === 0) {
    throw new BadRequest(
      "This is the only active admin account. Promote another admin before changing this one.",
    );
  }
};

const isActive = (value: unknown, fallback: number) =>
  value === undefined ? fallback : value ? 1 : 0;

/**
 * The SPA posts `teacherSubjects` (plural) while every other layer — the column,
 * `userOut`, the type — says `teacherSubject`. The key was silently dropped, so
 * picking subjects for a teacher saved nothing and then reported success.
 * Accept both spellings rather than break whichever client is already sending
 * the other one.
 */
const subjectIds = (body: any): string[] => {
  const raw = Array.isArray(body.teacherSubject)
    ? body.teacherSubject
    : Array.isArray(body.teacherSubjects)
      ? body.teacherSubjects
      : null;
  return raw ? raw.filter((id: unknown) => typeof id === "string") : [];
};

// POST /api/users/register — Private (Admin & Teacher; teachers make students only)
users.post("/register", protect, authorize(["admin", "teacher"]), async (c) => {
  const body = await c.req.json<any>().catch(() => ({}));
  const actor = c.get("user");

  const name = parseString(body.name, "name", { max: 120 });
  const email = parseString(body.email, "email", { max: 200 });
  if (!isEmail(email)) throw new BadRequest("Please enter a valid email address");
  const password = String(body.password ?? "");
  if (!password) throw new BadRequest("password is required");
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new BadRequest(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const role = assertAssignableRole(actor.role, body.role);

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
      role,
      isActive(body.isActive, 1),
      body.studentClass || null,
      JSON.stringify(subjectIds(body)),
      ts,
      ts,
    )
    .run();

  await logActivity(c.env, {
    userId: actor._id,
    action: "Registered User",
    details: `Registered user with email: ${email}`,
  });

  const row = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  return c.json({ ...userOut(row!), message: "User registered successfully" }, 201);
});

// POST /api/users/login — Public
users.post("/login", async (c) => {
  // 10/min/IP. Cheap brute-force protection on the one endpoint that verifies
  // a password; PBKDF2 at 100k iterations also makes each attempt expensive
  // for *us*, so this protects Worker CPU as much as the account.
  const rl = await c.env.RL_AUTH.limit({ key: clientIp(c) });
  if (!rl.success) {
    return c.json({ message: "Too many sign-in attempts. Try again in a minute." }, 429);
  }

  const { email, password } = await c.req.json<any>().catch(() => ({}));
  if (!email || !password) {
    return c.json({ message: "Invalid email or password" }, 401);
  }

  const row = await c.env.DB.prepare("SELECT * FROM users WHERE lower(email) = lower(?)")
    .bind(String(email))
    .first();
  if (!row || !(await verifyPassword(String(password), row.password as string))) {
    return c.json({ message: "Invalid email or password" }, 401);
  }
  if (row.isActive !== 1) {
    return c.json({ message: "This account has been deactivated" }, 403);
  }

  await issueToken(c, row.id as string);
  return c.json(userOut(row));
});

// POST /api/users/logout — Public, but ends the session for real.
//
// This used to clear the cookie and stop there, leaving the JWT valid for the
// rest of its 30 days — a copied token kept working after sign-out. Bumping the
// user's session epoch is what actually revokes it.
users.post("/logout", optionalAuth, async (c) => {
  const user = c.get("user");
  if (user) await revokeSessions(c.env.DB, user._id);
  clearToken(c);
  return c.json({ message: "Logged out successfully" });
});

/**
 * POST /api/users/forgot-password — Public.
 *
 * Always answers 200 with the same body. Saying "no account with that address"
 * would turn this into a way to test whether someone studies here.
 */
users.post("/forgot-password", async (c) => {
  const generic = {
    message: "If that address has an account, a reset link is on its way.",
  };

  const rl = await c.env.RL_RESET.limit({ key: clientIp(c) });
  // Silent on hit: a 429 here tells an attacker they found the interesting
  // endpoint, and the honest answer is indistinguishable from the generic one.
  if (!rl.success) return c.json(generic);

  const body = await c.req.json<any>().catch(() => ({}));
  const email = String(body.email ?? "").trim();
  if (!email || email.length > 200 || !isEmail(email)) return c.json(generic);

  const row = await c.env.DB.prepare(
    "SELECT id, name FROM users WHERE lower(email) = lower(?) AND isActive = 1",
  )
    .bind(email)
    .first();
  if (!row) return c.json(generic);

  // 32 random bytes, hex. Only its SHA-256 is stored, so the table cannot be
  // read back into working links.
  const token = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();

  await c.env.DB.batch([
    // One live token per person: requesting a new link retires the old ones.
    c.env.DB.prepare("DELETE FROM password_resets WHERE userId = ?").bind(row.id),
    c.env.DB.prepare(
      "INSERT INTO password_resets (tokenHash, userId, expiresAt, usedAt, createdAt) VALUES (?, ?, ?, NULL, ?)",
    ).bind(await sha256Hex(token), row.id, expiresAt, now()),
  ]);

  c.executionCtx.waitUntil(
    sendPasswordResetEmail(c.env, {
      to: email,
      fullName: String(row.name),
      token,
      expiresInMinutes: RESET_TTL_MS / 60_000,
    }).catch((error) => {
      // Event name only — never the address, the token or the link.
      console.error(JSON.stringify({ event: "password_reset_email_failed" }), error);
    }),
  );

  return c.json(generic);
});

/** Short on purpose: long enough to walk to your inbox, not to leave lying about. */
const RESET_TTL_MS = 60 * 60 * 1000;

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

/**
 * POST /api/users/reset-password — Public. Single-use, and it ends every session
 * the account already had: a reset is usually someone taking an account *back*.
 */
users.post("/reset-password", async (c) => {
  const rl = await c.env.RL_RESET.limit({ key: clientIp(c) });
  if (!rl.success) {
    return c.json({ message: "Too many attempts. Try again in a minute." }, 429);
  }

  const body = await c.req.json<any>().catch(() => ({}));
  const token = String(body.token ?? "");
  const password = String(body.password ?? "");
  if (!token || !password) {
    throw new BadRequest("token and password are required");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new BadRequest(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const invalid = { message: "This reset link is invalid or has expired." };
  const record = await c.env.DB.prepare(
    "SELECT * FROM password_resets WHERE tokenHash = ?",
  )
    .bind(await sha256Hex(token))
    .first();
  if (!record || record.usedAt || new Date(record.expiresAt as string).getTime() < Date.now()) {
    return c.json(invalid, 400);
  }

  const user = await c.env.DB.prepare("SELECT id FROM users WHERE id = ? AND isActive = 1")
    .bind(record.userId)
    .first();
  if (!user) return c.json(invalid, 400);

  const ts = now();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET password = ?, updatedAt = ? WHERE id = ?").bind(
      await hashPassword(password),
      ts,
      user.id,
    ),
    // Burn the token before anything else can use it.
    c.env.DB.prepare("UPDATE password_resets SET usedAt = ? WHERE tokenHash = ?").bind(
      ts,
      record.tokenHash,
    ),
  ]);
  await revokeSessions(c.env.DB, String(user.id));

  await logActivity(c.env, { userId: String(user.id), action: "Reset their password" });
  return c.json({ message: "Password updated. You can sign in now." });
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

  const rows = (list.results as any[]).map((r) => userOut(r));

  // `studentClass` and `teacherSubject` went out as bare ids while the table
  // rendered `user.studentClass.name` and `user.teacherSubjects`, so every
  // student read "Unassigned" and every teacher "Unassigned" no matter what was
  // actually set. Populate them the way every other list endpoint does.
  const [classMap, subjectMap] = await Promise.all([
    lookup(c.env.DB, "classes", rows.map((r) => r.studentClass), ["name"]),
    lookup(c.env.DB, "subjects", rows.flatMap((r) => r.teacherSubject as string[]), [
      "name",
      "code",
    ]),
  ]);

  return c.json({
    users: rows.map((r) => ({
      ...r,
      studentClass: r.studentClass ? (classMap.get(r.studentClass) ?? r.studentClass) : null,
      teacherSubject: (r.teacherSubject as string[]).map((id) => subjectMap.get(id) ?? id),
      // The SPA reads the plural spelling. Send both so neither side is wrong.
      teacherSubjects: (r.teacherSubject as string[]).map((id) => subjectMap.get(id) ?? id),
    })),
    pagination: meta(Number(countRow?.total ?? 0), page, limit),
  });
});

// PUT /api/users/update/:id — Private (Admin & Teacher; teachers, students only)
users.put("/update/:id", protect, authorize(["admin", "teacher"]), async (c) => {
  const id = c.req.param("id");
  const actor = c.get("user");
  const row = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  if (!row) return c.json({ message: "User not found" }, 404);

  // A teacher could edit any row, admins included — which is how a teacher
  // could set the admin's password and sign in as them. Editing your own
  // profile stays open to everyone; the role and active-flag guards below are
  // what stop that becoming a promotion.
  if (!isSelf(actor._id, id) && !canActOn(actor.role, row.role as Role)) {
    return c.json(
      { message: `A ${actor.role} is not authorized to modify a ${row.role} account` },
      403,
    );
  }

  const body = await c.req.json<any>().catch(() => ({}));
  const name = body.name !== undefined ? parseString(body.name, "name", { max: 120 }) : row.name;
  const email =
    body.email !== undefined ? parseString(body.email, "email", { max: 200 }) : String(row.email);
  if (body.email !== undefined && !isEmail(email)) {
    throw new BadRequest("Please enter a valid email address");
  }

  let role = row.role as Role;
  if (body.role !== undefined && body.role !== row.role) {
    // Only an admin changes roles at all, and never into a role they could not
    // have created in the first place.
    if (actor.role !== "admin") {
      throw new BadRequest("Only an admin can change a user's role");
    }
    role = assertAssignableRole(actor.role, body.role);
  }

  if (body.isActive !== undefined && actor.role !== "admin") {
    throw new BadRequest("Only an admin can activate or deactivate an account");
  }
  const nextActive = isActive(body.isActive, Number(row.isActive));
  await assertNotLastAdmin(c.env.DB, id, String(row.role), role === "admin" && nextActive === 1);

  const studentClass = body.studentClass !== undefined ? body.studentClass || null : row.studentClass;
  const hasSubjects =
    Array.isArray(body.teacherSubject) || Array.isArray(body.teacherSubjects);
  const teacherSubject = hasSubjects ? JSON.stringify(subjectIds(body)) : row.teacherSubject;

  if (body.password && String(body.password).length < MIN_PASSWORD_LENGTH) {
    throw new BadRequest(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (email.toLowerCase() !== String(row.email).toLowerCase()) {
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
    .bind(name, email, password, role, nextActive, studentClass, teacherSubject, now(), id)
    .run();

  // Deactivating someone, or changing their password, has to end the sessions
  // they already hold — otherwise neither action does anything until the JWT
  // expires up to 30 days later.
  if (body.password || (nextActive === 0 && row.isActive === 1)) {
    await revokeSessions(c.env.DB, id);
  }

  await logActivity(c.env, {
    userId: actor._id,
    action: "Updated User",
    details: `Updated user with email: ${email}`,
  });

  const updated = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  return c.json({ ...userOut(updated!), message: "User updated successfully" });
});

// DELETE /api/users/delete/:id — Private (Admin & Teacher; teachers, students only)
users.delete("/delete/:id", protect, authorize(["admin", "teacher"]), async (c) => {
  const id = c.req.param("id");
  const actor = c.get("user");
  const row = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  if (!row) return c.json({ message: "User not found" }, 404);
  if (!canActOn(actor.role, row.role as Role)) {
    return c.json(
      { message: `A ${actor.role} is not authorized to delete a ${row.role} account` },
      403,
    );
  }
  if (id === actor._id) {
    return c.json({ message: "You cannot delete your own account" }, 400);
  }
  await assertNotLastAdmin(c.env.DB, id, String(row.role), true);

  await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();

  // Relations are JSON columns with no foreign keys, so the row disappearing
  // leaves its id stranded in every array that referenced it and the UI renders
  // a hex string where a name should be. Subject deletion already did this
  // cleanup; user deletion never did.
  await Promise.all([
    pullFromJsonArray(c.env.DB, "classes", "students", id),
    pullFromJsonArray(c.env.DB, "subjects", "teacher", id),
  ]);
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE classes SET classTeacher = NULL, updatedAt = ? WHERE classTeacher = ?",
    ).bind(now(), id),
    // Their marked work is meaningless without them, and the exam results screen
    // would render a raw id in the student column.
    c.env.DB.prepare("DELETE FROM submissions WHERE student = ?").bind(id),
    c.env.DB.prepare("DELETE FROM exam_attempts WHERE student = ?").bind(id),
    c.env.DB.prepare("DELETE FROM password_resets WHERE userId = ?").bind(id),
    // Accepting an application minted this account; unlink so a re-accept does
    // not point at a user that no longer exists.
    c.env.DB.prepare("UPDATE applications SET userId = NULL WHERE userId = ?").bind(id),
  ]);

  await logActivity(c.env, {
    userId: actor._id,
    action: "Deleted User",
    details: `Deleted user with email: ${row.email}`,
  });
  return c.json({ message: "User deleted successfully" });
});

export default users;
