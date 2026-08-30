#!/usr/bin/env node
/**
 * Creates the first admin. `POST /api/users/register` is admin-only, so on a
 * fresh database there is no way in through the API — this writes the row
 * directly, and everyone else can then be created from the UI.
 *
 * Usage:
 *   node seed.mjs --local              # seed the local dev D1
 *   node seed.mjs --remote             # seed the deployed D1
 *   node seed.mjs --remote --email a@b.com --password 'secret'
 */
import { webcrypto as crypto } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ITERATIONS = 100_000;

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const hashPassword = async (password) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    key,
    256,
  );
  const b64 = (buf) => Buffer.from(buf).toString("base64");
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(bits)}`;
};

const newId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const secs = Math.floor(Date.now() / 1000);
  bytes[0] = (secs >>> 24) & 0xff;
  bytes[1] = (secs >>> 16) & 0xff;
  bytes[2] = (secs >>> 8) & 0xff;
  bytes[3] = secs & 0xff;
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const randomPassword = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
};

const sqlStr = (v) => (v === null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

const main = async () => {
  const remote = process.argv.includes("--remote");
  const name = arg("name", "Eugene Admin");
  const email = arg("email", "admin@eugenelms.com");
  const password = arg("password", randomPassword());

  const ts = new Date().toISOString();
  const id = newId();
  const hash = await hashPassword(password);

  // Re-seeding replaces the row rather than tripping the unique email index.
  const sql = `
DELETE FROM users WHERE lower(email) = lower(${sqlStr(email)});
INSERT INTO users (id, name, email, password, role, isActive, studentClass, teacherSubject, createdAt, updatedAt)
VALUES (${sqlStr(id)}, ${sqlStr(name)}, ${sqlStr(email)}, ${sqlStr(hash)}, 'admin', 1, NULL, '[]', ${sqlStr(ts)}, ${sqlStr(ts)});
`.trim();

  const file = join(tmpdir(), `edunexus-seed-${Date.now()}.sql`);
  writeFileSync(file, sql);
  try {
    execFileSync(
      "npx",
      ["wrangler", "d1", "execute", "edunexus", remote ? "--remote" : "--local", "--file", file, "-y"],
      { stdio: "inherit" },
    );
  } finally {
    unlinkSync(file);
  }

  console.log("\n=== Admin seeded ===");
  console.log(`target:   ${remote ? "remote (deployed D1)" : "local dev D1"}`);
  console.log(`email:    ${email}`);
  console.log(`password: ${password}`);
  console.log("====================\n");
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
