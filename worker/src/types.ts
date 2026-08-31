export type Role = "admin" | "teacher" | "student" | "parent";

/** Cloudflare Rate Limit binding (`ratelimits` in wrangler.jsonc). */
export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  AI: Ai;
  JWT_SECRET: string;
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  GEMINI_MODEL?: string;
  WORKERS_AI_MODEL?: string;
  /** Secret: `wrangler secret put RESEND_API_KEY`. Unset = emails are logged. */
  RESEND_API_KEY?: string;
  /** Public var in wrangler.jsonc. Must be on a Resend-verified domain. */
  RESEND_FROM?: string;
  /** 5/min/IP on the public admissions form. */
  RL_APPLY: RateLimitBinding;
  /** 10/min/IP on sign-in. */
  RL_AUTH: RateLimitBinding;
  /** 5/min/IP on password-reset requests. */
  RL_RESET: RateLimitBinding;
}

export interface AuthUser {
  _id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  studentClass: string | null;
  teacherSubject: string[];
  createdAt: string;
  updatedAt: string;
}

export type AppEnv = { Bindings: Env; Variables: { user: AuthUser } };
