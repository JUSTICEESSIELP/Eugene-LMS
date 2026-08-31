import { Hono } from "hono";
import type { AppEnv } from "../types";
import { protect } from "../lib/auth";
import { lookup } from "../lib/db";

const dashboard = new Hono<AppEnv>();

const count = async (db: D1Database, sql: string, args: unknown[] = []) => {
  const row = await db.prepare(sql).bind(...args).first();
  return Number(row?.total ?? 0);
};

// GET /api/dashboard/stats — Private, shape depends on the caller's role
dashboard.get("/stats", protect, async (c) => {
  const user = c.get("user");
  const db = c.env.DB;

  // Admins see system-wide activity; everyone else sees their own.
  const activitySql =
    user.role === "admin"
      ? "SELECT * FROM activity_logs ORDER BY createdAt DESC LIMIT 5"
      : "SELECT * FROM activity_logs WHERE user = ? ORDER BY createdAt DESC LIMIT 5";
  const activityArgs = user.role === "admin" ? [] : [user._id];

  const { results: logs } = await db.prepare(activitySql).bind(...activityArgs).all();
  const actorMap = await lookup(db, "users", (logs as any[]).map((l) => l.user), ["name"]);

  const recentActivity = (logs as any[]).map((log) => {
    const actor = actorMap.get(log.user as string)?.name ?? "Unknown";
    const at = new Date(log.createdAt as string).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${actor}: ${log.action} (${at})`;
  });

  if (user.role === "admin") {
    const [totalStudents, totalTeachers, activeExams] = await Promise.all([
      count(db, "SELECT COUNT(*) AS total FROM users WHERE role = 'student'"),
      count(db, "SELECT COUNT(*) AS total FROM users WHERE role = 'teacher'"),
      count(db, "SELECT COUNT(*) AS total FROM exams WHERE isActive = 1"),
    ]);
    return c.json({
      totalStudents,
      totalTeachers,
      activeExams,
      avgAttendance: null, // No attendance model yet — the UI shows "Not tracked".
      recentActivity,
    });
  }

  if (user.role === "teacher") {
    const [myClassesCount, pendingGrading] = await Promise.all([
      count(db, "SELECT COUNT(*) AS total FROM classes WHERE classTeacher = ?", [user._id]),
      count(
        db,
        `SELECT COUNT(*) AS total FROM submissions
         WHERE score = 0 AND exam IN (SELECT id FROM exams WHERE teacher = ?)`,
        [user._id],
      ),
    ]);
    return c.json({
      myClassesCount,
      pendingGrading,
      // Deriving this needs today's timetable row for the teacher; until that
      // is wired, say nothing rather than name a class that may not exist.
      nextClass: null,
      nextClassTime: null,
      recentActivity,
    });
  }

  if (user.role === "student") {
    const nowIso = new Date().toISOString();
    const nextExam = await db
      .prepare(
        "SELECT * FROM exams WHERE class = ? AND dueDate >= ? ORDER BY dueDate ASC LIMIT 1",
      )
      .bind(user.studentClass ?? "", nowIso)
      .first();
    const pendingAssignments = await count(
      db,
      "SELECT COUNT(*) AS total FROM exams WHERE class = ? AND isActive = 1 AND dueDate >= ?",
      [user.studentClass ?? "", nowIso],
    );
    return c.json({
      myAttendance: null, // No attendance model yet.
      pendingAssignments,
      nextExam: nextExam?.title ?? "No upcoming exams",
      nextExamDate: nextExam ? new Date(nextExam.dueDate as string).toLocaleDateString() : "",
      recentActivity,
    });
  }

  return c.json({ recentActivity });
});

export default dashboard;
