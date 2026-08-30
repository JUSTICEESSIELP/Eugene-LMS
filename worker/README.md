# Edunexus on Cloudflare

The Express + MongoDB backend ported to a single Cloudflare Worker: Hono for the
API, **D1** for storage, and the built React SPA served from the same Worker as
static assets.

**Live:** https://eugene-lms.workplacefiles.com

## Layout

```
worker/
  schema.sql          D1 schema (8 tables)
  seed.mjs            Creates the first admin (see "First login")
  wrangler.jsonc      Worker config: D1, AI, assets, custom domain
  src/
    index.ts          Hono app, route mounting, static-asset fallback
    types.ts          Env bindings + AuthUser
    jobs.ts           AI generation + grading (was Inngest)
    lib/
      ai.ts           Gemini REST, with Workers AI fallback
      auth.ts         JWT cookie auth, `protect` / `authorize`
      db.ts           `lookup()` (Mongoose `.populate()` stand-in), pagination
      ids.ts          24-hex ObjectId-shaped ids
      password.ts     PBKDF2-SHA256 via WebCrypto
      rows.ts         D1 rows -> the JSON shapes the frontend expects
    routes/           users, academicYears, subjects, classes, timetables,
                      exams, dashboard, activities, applications
  migrations/
    0001_applications.sql   Adds the admissions table to a live database
```

## How the port maps to the original

| Original | Here | Why |
| --- | --- | --- |
| Express | Hono | Runs on Workers; same routing model |
| MongoDB + Mongoose | D1 (SQLite) | Cloudflare-native |
| `ObjectId` | 24-char hex string | Same shape, so the frontend is unchanged |
| `.populate()` | `lookup()` in `lib/db.ts` | One batched `IN (...)` query per relation |
| Array/nested fields | JSON columns | Keeps response shapes identical |
| bcryptjs | PBKDF2 (WebCrypto) | bcryptjs is pure JS and burns Worker CPU |
| Inngest functions | `ctx.waitUntil()` + a `status` column | No external service to run |
| Inngest grading | Inline | It is a few string comparisons |

Rows carry `status` (`pending` / `ready` / `failed`) plus an `error` column, which
is what Inngest's dashboard used to give you.

## Setup

```bash
bun install

# Local secrets
cat > .dev.vars <<'ENV'
JWT_SECRET="any-long-random-string"
GOOGLE_GENERATIVE_AI_API_KEY="..."   # optional; falls back to Workers AI
ENV

bun run db:local          # apply schema.sql to the local D1
node seed.mjs --local     # create the first admin
bun run dev               # http://localhost:8787
```

The frontend must be built first — the Worker serves `../frontend/dist`:

```bash
cd ../frontend && bun install && bun run build
```

## Deploy

```bash
export CLOUDFLARE_API_TOKEN=...
cd ../frontend && bun run build && cd ../worker

bun run db:remote                                  # first time only
bunx wrangler secret put JWT_SECRET
bunx wrangler secret put GOOGLE_GENERATIVE_AI_API_KEY
bun run deploy
node seed.mjs --remote                             # first time only
```

## First login

`POST /api/users/register` is admin-only, so a fresh database has no way in
through the API — no user exists to authorise the first registration. `seed.mjs`
writes that first admin row directly. Everyone else is created from the UI.

```bash
node seed.mjs --remote --email you@example.com --password 'your-password'
```

## Admissions

`POST /api/applications` is the one unauthenticated write path on the API — it
backs the public `/apply` page, so prospective students can apply without an
account. Admins review the queue at `/admissions` and move each application
through `pending -> reviewing -> accepted / rejected`.

Applying the table to a database that already has data:

```bash
bunx wrangler d1 execute edunexus --remote --file=./migrations/0001_applications.sql
```

Do **not** re-run `schema.sql` against a live database — it drops every table.

Re-running it replaces that email's row rather than tripping the unique index.

## AI

`lib/ai.ts` prefers Gemini when `GOOGLE_GENERATIVE_AI_API_KEY` is set and falls
back to the Workers AI binding otherwise. `GET /api/health` reports which is live.

Thinking is disabled (`thinkingBudget: 0`): on the timetable prompt it tripled
latency (~30s vs ~10s) and pushed the job past its budget, and these are
structured-output tasks where the reasoning pass buys nothing.

## Fixes made during the port

The frontend was calling endpoints the old router never bound:

- `PUT /classes/update/:id` — the UI sent `PUT`, the router only bound `PATCH`.
  Update routes now accept both verbs.
- `DELETE /exams/:id` — the Exams page has a delete button with no endpoint
  behind it. Added, and it clears that exam's submissions too.
- `updateClass` only ran when some *other* class existed, and returned nothing
  otherwise, so the client hung forever. Rewritten.

Then, when the landing page was tested end-to-end, none of its calls-to-action
did anything — every "Apply Now" / "Start Application" was a bare `<button>`
with no handler and no route, and the page had no link into the app at all.
They now route to `/apply` (a real form) and `/login`. The navbar's "AI Guide"
link pointed at `#assistant`, a section that does not exist on the page.

Two form bugs surfaced from the same pass:

- Both this form and the existing login form set `<input type="email">` inside a
  plain `<form>`. The browser's own constraint validation silently blocked
  submit before react-hook-form ran, so zod's messages never appeared and no
  request was sent. Both forms now set `noValidate` and let zod own validation.
- `CustomInput` rendered its `<FieldLabel>` with no `htmlFor` and its `<Input>`
  with no `id`, so no label was associated with its control. It now derives an
  id with `useId()`.

The frontend also had pre-existing build breakers: `ExamRadio.tsx` imported from
`@/type` (missing `s`), `react-resizable-panels` v4 renamed `PanelGroup`/
`PanelResizeHandle` to `Group`/`Separator`, `vite.config.ts` declared `plugins`
twice so the React Compiler plugin never ran, and there were unused imports under
`noUnusedLocals`.

## End-to-end tests

Playwright specs live in `../e2e`. They run against the deployed Worker by
default:

```bash
cd ../e2e
npm install && npx playwright install chromium
npx playwright test                                    # production
BASE_URL=http://localhost:8787 npx playwright test     # local wrangler dev

# The admin spec is skipped unless credentials are provided:
ADMIN_EMAIL=... ADMIN_PASSWORD=... npx playwright test
```

Coverage: every landing-page CTA navigates, navbar anchors resolve to real
sections, a visitor can apply without an account, the form rejects a bad email,
and an admin can sign in and see that application in the queue.
