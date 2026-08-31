import { sign, verify } from "hono/jwt";
import { getCookie, setCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";
import { userOut } from "./rows";
import type { Env, AuthUser, Role } from "../types";

const THIRTY_DAYS = 30 * 24 * 60 * 60;

/**
 * Tokens carry their issue time in **milliseconds** (`iatMs`), not the standard
 * second-resolution `iat`. Revocation compares it against `users.sessionEpoch`,
 * and at second resolution a sign-out and the sign-in immediately after it can
 * land in the same second — which would either leave the old token alive or
 * kill the new one, depending on which way the comparison rounded.
 */
export const issueToken = async (c: Context<any>, userId: string) => {
  const token = await sign(
    { userId, iatMs: Date.now(), exp: Math.floor(Date.now() / 1000) + THIRTY_DAYS },
    c.env.JWT_SECRET,
    "HS512",
  );
  setCookie(c, "jwt", token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: THIRTY_DAYS,
    path: "/",
  });
  return token;
};

export const clearToken = (c: Context<any>) => {
  setCookie(c, "jwt", "", {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 0,
    path: "/",
  });
};

/**
 * Ends every session a user currently holds. Called on sign-out, on
 * deactivation, and whenever a password changes — a password change that left
 * the thief's existing session alive would defeat the point of changing it.
 */
export const revokeSessions = async (db: D1Database, userId: string) => {
  await db
    .prepare("UPDATE users SET sessionEpoch = ?, updatedAt = ? WHERE id = ?")
    .bind(Date.now(), new Date().toISOString(), userId)
    .run();
};

type TokenPayload = { userId: string; iatMs?: number };

/**
 * A token is only as good as the account behind it. Three things can kill one
 * before its 30 days are up: the row is gone, the account was deactivated, or
 * the session epoch moved past its issue time.
 */
const sessionState = (
  row: Record<string, any>,
  payload: TokenPayload,
): "ok" | "deactivated" | "revoked" => {
  if (row.isActive !== 1) return "deactivated";
  const epoch = row.sessionEpoch == null ? null : Number(row.sessionEpoch);
  // A token minted before `sessionEpoch` predates the sign-out (or password
  // change) that set it. Tokens with no `iatMs` are pre-upgrade, so treat them
  // as issued at the epoch dawn and let any revocation catch them.
  if (epoch && (payload.iatMs ?? 0) < epoch) return "revoked";
  return "ok";
};

/** Mirrors the old Express `protect` middleware. */
export const protect: MiddlewareHandler<{ Bindings: Env; Variables: { user: AuthUser } }> =
  async (c, next) => {
    // Cookie first (that's what the browser app uses); Bearer is a convenience
    // for curl/CI so the API stays testable outside a browser.
    const bearer = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
    const token = getCookie(c, "jwt") || bearer;
    if (!token) {
      return c.json({ message: "Not authorized, no token" }, 401);
    }
    let payload: TokenPayload;
    try {
      payload = (await verify(token, c.env.JWT_SECRET, "HS512")) as TokenPayload;
    } catch {
      return c.json({ message: "Not authorized, token failed" }, 401);
    }
    const row = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
      .bind(payload.userId)
      .first();
    if (!row) {
      return c.json({ message: "Not authorized, user not found" }, 401);
    }
    const state = sessionState(row, payload);
    if (state === "deactivated") {
      clearToken(c);
      return c.json({ message: "This account has been deactivated" }, 401);
    }
    if (state === "revoked") {
      clearToken(c);
      return c.json({ message: "Session ended. Please sign in again." }, 401);
    }
    c.set("user", userOut(row) as AuthUser);
    await next();
  };

/**
 * Resolves a session when one is present and continues regardless. For
 * endpoints where "nobody is signed in" is a valid answer rather than an
 * error — the SPA's profile probe runs on public pages too.
 */
export const optionalAuth: MiddlewareHandler<{
  Bindings: Env;
  Variables: { user: AuthUser };
}> = async (c, next) => {
  const bearer = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  const token = getCookie(c, "jwt") || bearer;
  if (token) {
    try {
      const payload = (await verify(token, c.env.JWT_SECRET, "HS512")) as TokenPayload;
      const row = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
        .bind(payload.userId)
        .first();
      // A revoked or deactivated session is "nobody is signed in" on this path,
      // not an error — same answer as no token at all.
      if (row && sessionState(row, payload) === "ok") c.set("user", userOut(row) as AuthUser);
    } catch {
      // An expired or forged token is treated the same as no token here.
    }
  }
  await next();
};

/** Mirrors the old Express `authorize([...roles])` middleware. */
export const authorize =
  (roles: Role[]): MiddlewareHandler<{ Bindings: Env; Variables: { user: AuthUser } }> =>
  async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ message: "Not authorized, user not found" }, 401);
    if (!roles.includes(user.role)) {
      return c.json(
        { message: `User role '${user.role}' is not authorized to access this route` },
        403,
      );
    }
    await next();
  };
