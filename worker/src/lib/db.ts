import type { Env } from "../types";
import { newId, now } from "./ids";

/**
 * Stand-in for Mongoose `.populate()`: fetch a set of ids in one query and
 * return a lookup map, so callers can inline `{_id, name, ...}` sub-documents.
 */
export const lookup = async (
  db: D1Database,
  table: string,
  ids: (string | null | undefined)[],
  fields: string[],
): Promise<Map<string, Record<string, any>>> => {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const map = new Map<string, Record<string, any>>();
  if (unique.length === 0) return map;

  // D1 has a bound-parameter ceiling, so chunk large id sets.
  const CHUNK = 90;
  const cols = ["id", ...fields.filter((f) => f !== "id")].join(", ");
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => "?").join(", ");
    const { results } = await db
      .prepare(`SELECT ${cols} FROM ${table} WHERE id IN (${placeholders})`)
      .bind(...chunk)
      .all();
    for (const row of results as Record<string, any>[]) {
      const { id, ...rest } = row;
      map.set(id as string, { _id: id, ...rest });
    }
  }
  return map;
};

/** Replace an id with its populated sub-document, falling back to the raw id. */
export const populated = (
  map: Map<string, Record<string, any>>,
  id: string | null | undefined,
) => (id ? (map.get(id) ?? id) : null);

export const logActivity = async (
  env: Env,
  { userId, action, details }: { userId: string; action: string; details?: string },
) => {
  try {
    const ts = now();
    await env.DB.prepare(
      `INSERT INTO activity_logs (id, user, action, details, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(newId(), userId, action, details ?? null, ts, ts)
      .run();
  } catch (error) {
    // Logging must never take down the request that triggered it.
    console.error("Failed to log activity:", error);
  }
};

/** `{ total, page, pages, limit }` — same meta block the old API returned. */
export const paginate = (url: URL, fallbackLimit = 10) => {
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "") || 1);
  const limit = Math.max(1, parseInt(url.searchParams.get("limit") ?? "") || fallbackLimit);
  return { page, limit, offset: (page - 1) * limit };
};

export const meta = (total: number, page: number, limit: number) => ({
  total,
  page,
  pages: Math.ceil(total / limit) || 0,
  limit,
});
