import { Hono } from "hono";
import type { AppEnv } from "../types";
import { authorize, protect } from "../lib/auth";
import { logActivity, meta, paginate } from "../lib/db";
import {
  sendApplicationAcceptedEmail,
  sendApplicationReceivedEmail,
  sendApplicationRejectedEmail,
} from "../lib/email";
import { generateTempPassword, hashPassword } from "../lib/password";
import { newId, now } from "../lib/ids";
import type { Row } from "../lib/rows";
import { revokeSessions } from "../lib/auth";
import { isEmail, parseString } from "../lib/validate";

const applications = new Hono<AppEnv>();

const STATUSES = ["pending", "reviewing", "accepted", "rejected"] as const;
type Status = (typeof STATUSES)[number];

/**
 * Which moves the pipeline allows.
 *
 * There were no rules at all: an application could go accepted → pending →
 * accepted → rejected, and each hop fired another email. The second acceptance
 * sent a "your account is ready" mail with no temporary password in it (the
 * account already existed), telling the applicant to sign in with a password
 * they had never chosen. `accepted` and `rejected` are terminal — an admin who
 * truly needs to redo one can delete the application.
 */
const TRANSITIONS: Record<Status, readonly Status[]> = {
  pending: ["reviewing", "accepted", "rejected"],
  reviewing: ["pending", "accepted", "rejected"],
  accepted: [],
  rejected: [],
};

const applicationOut = (row: Row): Row => {
  const { id, ...rest } = row;
  return { _id: id, ...rest };
};

// POST /api/applications — PUBLIC. This is the one write path on the whole API
// that does not require a session: it backs the "Apply Now" page.
applications.post("/", async (c) => {
  // 5/min/IP, before any database or email work. This is the only write path on
  // the API with no session behind it, and it now triggers an outbound Resend
  // call — without a limiter it is a way to make Veya send mail on demand.
  const ip = c.req.header("CF-Connecting-IP") ?? "anon";
  const rl = await c.env.RL_APPLY.limit({ key: ip });
  if (!rl.success) {
    return c.json(
      { message: "Too many applications from this connection. Try again shortly." },
      429,
    );
  }

  const body = await c.req.json<any>().catch(() => ({}));
  const fullName = parseString(body.fullName, "Full name", { max: 120 });
  const email = parseString(body.email, "Email", { max: 200 });
  const program = parseString(body.program, "Program", { max: 120 });
  const phone = parseString(body.phone, "Phone", { max: 40, required: false, fallback: "" });
  const message = parseString(body.message, "Message", {
    max: 2000,
    required: false,
    fallback: "",
  });

  if (!fullName || !email || !program) {
    return c.json({ message: "Full name, email and program are required" }, 400);
  }
  if (!isEmail(email)) {
    return c.json({ message: "Please enter a valid email address" }, 400);
  }

  // The guard used to match `status = 'pending'` only, so the moment an admin
  // moved an application to `reviewing` the same address could apply again for
  // the same programme and re-trigger the confirmation email.
  const existing = await c.env.DB.prepare(
    "SELECT id, status FROM applications WHERE lower(email) = lower(?) AND program = ? AND status IN ('pending','reviewing')",
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

  // Confirmation goes out after the response — a slow or down Resend must never
  // make an applicant think their submission failed.
  c.executionCtx.waitUntil(
    sendApplicationReceivedEmail(c.env, { to: email, fullName, program }).catch((error) => {
      console.error(JSON.stringify({ event: "application_received_email_failed" }), error);
    }),
  );

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

/**
 * What accepting an application did to the user table. `temporaryPassword` is
 * returned exactly once — it is hashed on the way into the database, so this
 * response is the only copy the admin will ever see.
 */
type AcceptedAccount = {
  userId: string;
  email: string;
  created: boolean;
  temporaryPassword?: string;
  note: string;
};

/**
 * Acceptance is what actually admits someone: it mints the student account the
 * applicant signs in with. Idempotent — an application that already carries a
 * `userId` never mints a second one, and an address that already has an account
 * is linked rather than clobbered (we do not touch that account's password).
 */
const acceptApplication = async (
  env: AppEnv["Bindings"],
  row: Row,
): Promise<AcceptedAccount> => {
  const email = String(row.email);
  const ts = now();

  if (row.userId) {
    return {
      userId: String(row.userId),
      email,
      created: false,
      note: "This application already has an account. No new account was created and no password was changed.",
    };
  }

  const existing = await env.DB.prepare("SELECT id FROM users WHERE lower(email) = lower(?)")
    .bind(email)
    .first();
  if (existing) {
    // Link, don't clobber. Resetting a live password because an admin clicked
    // "accepted" would lock a real person out of their account.
    await env.DB.prepare("UPDATE applications SET userId = ? WHERE id = ?")
      .bind(existing.id, row.id)
      .run();
    return {
      userId: String(existing.id),
      email,
      created: false,
      note: "This address already had an account, so it was linked to this application. Their existing password is unchanged.",
    };
  }

  const temporaryPassword = generateTempPassword();
  const userId = newId();
  await env.DB.prepare(
    `INSERT INTO users (id, name, email, password, role, isActive, studentClass, teacherSubject, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, 'student', 1, NULL, '[]', ?, ?)`,
  )
    .bind(userId, String(row.fullName), email, await hashPassword(temporaryPassword), ts, ts)
    .run();
  await env.DB.prepare("UPDATE applications SET userId = ? WHERE id = ?").bind(userId, row.id).run();

  return {
    userId,
    email,
    created: true,
    temporaryPassword,
    note: "No class is assigned yet — set one under People › Students.",
  };
};

// PATCH /api/applications/:id — Private/Admin, move it through the pipeline
applications.on(["PUT", "PATCH"], "/:id", protect, authorize(["admin"]), async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM applications WHERE id = ?").bind(id).first();
  if (!row) return c.json({ message: "Application not found" }, 404);

  const { status } = await c.req.json<any>().catch(() => ({}));
  if (!STATUSES.includes(status)) {
    return c.json({ message: `status must be one of: ${STATUSES.join(", ")}` }, 400);
  }

  const from = row.status as Status;
  // Only a real transition notifies the applicant. Re-saving "accepted" on an
  // already-accepted row must not re-send anything or mint a second account.
  const isTransition = from !== status;
  if (isTransition && !TRANSITIONS[from].includes(status as Status)) {
    return c.json(
      {
        message:
          TRANSITIONS[from].length === 0
            ? `This application is already ${from} and cannot be changed.`
            : `An application that is ${from} can only move to: ${TRANSITIONS[from].join(", ")}.`,
      },
      409,
    );
  }
  const account = status === "accepted" ? await acceptApplication(c.env, row as Row) : null;

  // Rejecting an application that had already minted a student account used to
  // leave that account live and signed-in-able. It cannot happen through the
  // pipeline any more (accepted is terminal), but an older row can still be in
  // that state, so undo it properly rather than trusting the new rule alone.
  if (status === "rejected" && row.userId) {
    await c.env.DB.prepare(
      "UPDATE users SET isActive = 0, updatedAt = ? WHERE id = ?",
    )
      .bind(now(), row.userId)
      .run();
    await revokeSessions(c.env.DB, String(row.userId));
  }

  await c.env.DB.prepare("UPDATE applications SET status = ?, updatedAt = ? WHERE id = ?")
    .bind(status, now(), id)
    .run();
  await logActivity(c.env, {
    userId: c.get("user")._id,
    action: `Marked application from ${row.email} as ${status}`,
    details: account?.created
      ? `Created student account for ${row.email}`
      : account
        ? `Linked application to existing account for ${row.email}`
        : undefined,
  });

  if (isTransition && (status === "accepted" || status === "rejected")) {
    const args = {
      to: String(row.email),
      fullName: String(row.fullName),
      program: String(row.program),
    };
    // Same pattern as exam generation: the admin's request returns immediately
    // and a failing Resend call never fails the status change.
    c.executionCtx.waitUntil(
      (status === "accepted"
        ? sendApplicationAcceptedEmail(c.env, {
            ...args,
            temporaryPassword: account?.temporaryPassword,
          })
        : sendApplicationRejectedEmail(c.env, args)
      ).catch((error) => {
        console.error(JSON.stringify({ event: "application_decision_email_failed", status }), error);
      }),
    );
  }

  const updated = await c.env.DB.prepare("SELECT * FROM applications WHERE id = ?")
    .bind(id)
    .first();
  return c.json({ ...applicationOut(updated!), ...(account ? { account } : {}) });
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
