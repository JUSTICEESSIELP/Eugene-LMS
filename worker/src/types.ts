export type Role = "admin" | "teacher" | "student" | "parent";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  AI: Ai;
  JWT_SECRET: string;
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  GEMINI_MODEL?: string;
  WORKERS_AI_MODEL?: string;
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
