import type { Role } from "../types";

/**
 * Input guards shared by the route handlers.
 *
 * Every one of these exists because the same three shapes of bad input reached
 * the database and came back as a 500 with a raw engine message: an unparseable
 * date handed to `new Date(...).toISOString()`, a `role` string the table's
 * CHECK constraint rejected, and a number that was negative when nothing
 * downstream expected it to be. A 400 that names the field is the whole point.
 */

/** Thrown by the parsers below; handlers turn it into a 400. */
export class BadRequest extends Error {}

export const ROLES: readonly Role[] = ["admin", "teacher", "student", "parent"];

export const isRole = (value: unknown): value is Role =>
  typeof value === "string" && (ROLES as readonly string[]).includes(value);

/**
 * `new Date("banana").toISOString()` throws `RangeError: Invalid time value`,
 * which reached the client as a 500. Callers get a named 400 instead.
 */
export const parseDate = (value: unknown, field: string): string => {
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequest(`${field} is not a valid date`);
  }
  return date.toISOString();
};

/** Same, but `undefined`/`null`/`""` means "not supplied" rather than invalid. */
export const parseOptionalDate = (value: unknown, field: string): string | null =>
  value === undefined || value === null || value === "" ? null : parseDate(value, field);

/** A whole number inside `[min, max]`, or a 400 naming the field. */
export const parseInt_ = (
  value: unknown,
  field: string,
  { min, max, fallback }: { min: number; max: number; fallback?: number },
): number => {
  if (value === undefined || value === null || value === "") {
    if (fallback !== undefined) return fallback;
    throw new BadRequest(`${field} is required`);
  }
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new BadRequest(`${field} must be a whole number`);
  }
  if (n < min || n > max) {
    throw new BadRequest(`${field} must be between ${min} and ${max}`);
  }
  return n;
};

/** Trimmed string with a length ceiling — unbounded text columns are a DoS. */
export const parseString = (
  value: unknown,
  field: string,
  { max, required = true, fallback }: { max: number; required?: boolean; fallback?: string },
): string => {
  if (value === undefined || value === null) {
    if (fallback !== undefined) return fallback;
    if (required) throw new BadRequest(`${field} is required`);
    return "";
  }
  const s = String(value).trim();
  if (required && !s) throw new BadRequest(`${field} is required`);
  if (s.length > max) throw new BadRequest(`${field} must be ${max} characters or fewer`);
  return s;
};

/** Deliberately liberal — the real check is whether mail to it lands. */
export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/**
 * Wraps a handler so a `BadRequest` becomes a 400 instead of falling through to
 * `app.onError`, which answers 500 and echoes `err.message`.
 */
export const handleBadRequest = (error: unknown): { message: string } | null =>
  error instanceof BadRequest ? { message: error.message } : null;
