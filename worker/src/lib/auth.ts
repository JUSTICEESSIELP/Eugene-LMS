import { sign, verify } from "hono/jwt";
import { getCookie, setCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";
import { userOut } from "./rows";
import type { Env, AuthUser, Role } from "../types";

const THIRTY_DAYS = 30 * 24 * 60 * 60;

export const issueToken = async (c: Context<any>, userId: string) => {
  const token = await sign(
    { userId, exp: Math.floor(Date.now() / 1000) + THIRTY_DAYS },
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
    let userId: string;
    try {
      const payload = (await verify(token, c.env.JWT_SECRET, "HS512")) as { userId: string };
      userId = payload.userId;
    } catch {
      return c.json({ message: "Not authorized, token failed" }, 401);
    }
    const row = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
      .bind(userId)
      .first();
    if (!row) {
      return c.json({ message: "Not authorized, user not found" }, 401);
    }
    c.set("user", userOut(row) as AuthUser);
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
