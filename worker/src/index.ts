import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnv } from "./types";
import { aiProvider } from "./lib/ai";
import { BadRequest } from "./lib/validate";
import users from "./routes/users";
import activities from "./routes/activities";
import academicYears from "./routes/academicYears";
import classes from "./routes/classes";
import subjects from "./routes/subjects";
import timetables from "./routes/timetables";
import exams from "./routes/exams";
import dashboard from "./routes/dashboard";
import applications from "./routes/applications";

const app = new Hono<AppEnv>();

app.use("*", logger());
app.use(
  "*",
  secureHeaders({
    // The SPA is served from this same origin; the default CSP here would
    // block the bundled scripts, so headers only (no CSP) is the right call.
    contentSecurityPolicy: undefined,
  }),
);

// The API and the SPA share an origin in production, so CORS is only needed
// for `vite dev` on :5173 talking to a deployed or local Worker.
//
// This callback used to read `test(origin) ? origin : origin` — both branches
// returned the origin, so the check was a no-op and *every* site on the
// internet was handed `Access-Control-Allow-Origin: <itself>` alongside
// `Allow-Credentials: true`. `SameSite=Lax` on the cookie is what kept that
// from being exploitable; the header should not have been depending on it.
app.use(
  "/api/*",
  cors({
    origin: (origin) =>
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin ?? "") ? origin : "",
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

// Health check — mirrors the old Express `GET /`.
app.get("/api", (c) =>
  c.json({
    status: "OK",
    message: "Server is healthy",
    runtime: "cloudflare-workers",
    database: "d1",
    ai: aiProvider(c.env),
  }),
);
app.get("/api/health", (c) =>
  c.json({ status: "OK", message: "Server is healthy", ai: aiProvider(c.env) }),
);

app.route("/api/users", users);
app.route("/api/activities", activities);
app.route("/api/academic-years", academicYears);
app.route("/api/classes", classes);
app.route("/api/subjects", subjects);
app.route("/api/timetables", timetables);
app.route("/api/exams", exams);
app.route("/api/dashboard", dashboard);
app.route("/api/applications", applications);

app.notFound((c) =>
  c.req.path.startsWith("/api/")
    ? c.json({ message: `Not found: ${c.req.method} ${c.req.path}` }, 404)
    : // Anything else is a SPA route — hand it to the static asset router.
      c.env.ASSETS.fetch(c.req.raw),
);

app.onError((err, c) => {
  // Input the handlers rejected on purpose: a named 400, not a 500.
  if (err instanceof BadRequest) {
    return c.json({ message: err.message }, 400);
  }
  console.error("Unhandled error:", err);
  // `err.message` used to be echoed to the client, which turned a failed
  // constraint into a response carrying the table definition — e.g.
  // "D1_ERROR: CHECK constraint failed: role IN (...)". Log it, don't ship it.
  return c.json({ message: "Server Error" }, 500);
});

export default app;
