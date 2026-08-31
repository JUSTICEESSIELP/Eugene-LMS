import { Hono } from "hono";
import type { AppEnv } from "../types";
import { authorize, protect } from "../lib/auth";
import { logActivity, lookup, populated } from "../lib/db";
import { newId, now } from "../lib/ids";
import { timetableOut } from "../lib/rows";
import { generateTimetableJob } from "../jobs";

const timetables = new Hono<AppEnv>();

// POST /api/timetables/generate — Private/Admin
timetables.post("/generate", protect, authorize(["admin"]), async (c) => {
  const { classId, academicYearId, settings } = await c.req.json<any>().catch(() => ({}));
  if (!classId || !academicYearId) {
    return c.json({ message: "classId and academicYearId are required" }, 400);
  }

  const ts = now();
  const existing = await c.env.DB.prepare(
    "SELECT id FROM timetables WHERE class = ? AND academicYear = ?",
  )
    .bind(classId, academicYearId)
    .first();

  // Regenerating reuses the row so the unique (class, academicYear) index holds.
  const timetableId = (existing?.id as string) ?? newId();
  if (existing) {
    await c.env.DB.prepare(
      "UPDATE timetables SET status = 'pending', error = NULL, updatedAt = ? WHERE id = ?",
    )
      .bind(ts, timetableId)
      .run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO timetables (id, class, academicYear, schedule, status, createdAt, updatedAt)
       VALUES (?, ?, ?, '[]', 'pending', ?, ?)`,
    )
      .bind(timetableId, classId, academicYearId, ts, ts)
      .run();
  }

  await logActivity(c.env, {
    userId: c.get("user")._id,
    action: `Requested timetable generation for class ID: ${classId}`,
  });

  // Answer now, generate after — same shape the Inngest version returned.
  c.executionCtx.waitUntil(
    generateTimetableJob(c.env, {
      timetableId,
      classId,
      academicYearId,
      settings: {
        startTime: settings?.startTime ?? "08:00",
        endTime: settings?.endTime ?? "14:00",
        periods: Number(settings?.periods) || 5,
      },
    }),
  );

  return c.json({ message: "Timetable generation initiated", timetableId });
});

// GET /api/timetables/:classId — Private, periods populated
timetables.get("/:classId", protect, async (c) => {
  const user = c.get("user");
  const classId = c.req.param("classId");
  // This was `protect` and nothing else, so any signed-in account could read
  // any class's schedule — including which teacher is where, all week. Staff
  // work across classes; everyone else gets their own.
  if (user.role !== "admin" && user.role !== "teacher" && classId !== user.studentClass) {
    return c.json({ message: "You are not authorized to view this timetable." }, 403);
  }

  const row = await c.env.DB.prepare(
    "SELECT * FROM timetables WHERE class = ? ORDER BY updatedAt DESC LIMIT 1",
  )
    .bind(classId)
    .first();

  if (!row) return c.json({ message: "Timetable not found" }, 404);
  if (row.status === "pending") {
    return c.json({ message: "Timetable generation in progress", status: "pending" }, 404);
  }
  if (row.status === "failed") {
    return c.json(
      { message: row.error || "Timetable generation failed", status: "failed" },
      404,
    );
  }

  const timetable = timetableOut(row);
  const periods = timetable.schedule.flatMap((day: any) => day?.periods ?? []);
  const [subjectMap, teacherMap] = await Promise.all([
    lookup(c.env.DB, "subjects", periods.map((p: any) => p?.subject), ["name", "code"]),
    lookup(c.env.DB, "users", periods.map((p: any) => p?.teacher), ["name", "email"]),
  ]);

  return c.json({
    ...timetable,
    schedule: timetable.schedule.map((day: any) => ({
      ...day,
      periods: (day?.periods ?? []).map((p: any) => ({
        ...p,
        subject: populated(subjectMap, p?.subject),
        teacher: populated(teacherMap, p?.teacher),
      })),
    })),
  });
});

export default timetables;
