import { Hono } from "hono";
import type { AppEnv } from "../types";
import { authorize, protect } from "../lib/auth";
import { lookup, paginate, populated } from "../lib/db";
import { activityOut } from "../lib/rows";

const activities = new Hono<AppEnv>();

// GET /api/activities — Private (Admin & Teacher)
activities.get("/", protect, authorize(["admin", "teacher"]), async (c) => {
  const url = new URL(c.req.url);
  const { page, limit, offset } = paginate(url);

  const [countRow, list] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS total FROM activity_logs").first(),
    c.env.DB.prepare(
      "SELECT * FROM activity_logs ORDER BY createdAt DESC LIMIT ? OFFSET ?",
    )
      .bind(limit, offset)
      .all(),
  ]);

  const rows = (list.results as any[]).map(activityOut);
  const userMap = await lookup(c.env.DB, "users", rows.map((r) => r.user), [
    "name",
    "email",
    "role",
  ]);
  const total = Number(countRow?.total ?? 0);

  return c.json({
    logs: rows.map((r) => ({ ...r, user: populated(userMap, r.user) })),
    page,
    pages: Math.ceil(total / limit) || 0,
    total,
  });
});

export default activities;
