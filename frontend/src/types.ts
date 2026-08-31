export type UserRole = "admin" | "teacher" | "student" | "parent";

export interface pagination {
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export interface user {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  studentClass?: Class;
  teacherSubjects?: subject[];
}

export interface academicYear {
  _id: string;
  name: string; // "2024-2025"
  fromYear: Date; // "2024-09-01"
  toYear: Date; // "2025-06-30"
  isCurrent: boolean; // true/false
}

export interface Class {
  _id: string;
  name: string; // e.g., "Grade 10"
  academicYear: academicYear; // Link to "2024-2025"
  classTeacher: user; // The main teacher in charge
  subjects: subject[]; // List of subjects taught in this class
  students: user[]; // List of students enrolled
  capacity: number; // Max students allowed (optional)
}

export interface subject {
  _id: string;
  name: string; // "Mathematics"
  code: string; // "MATH101"
  teacher?: user[]; // Default teacher for this subject
  isActive: boolean; // Indicates if the subject is currently active
}

export interface question {
  _id: string;
  questionText: string;
  type: string;
  options: string[]; // Array of strings e.g. ["A", "B", "C", "D"]
  correctAnswer: string; // Hidden from students in default queries
  points: number;
}

export interface exam {
  _id: string;
  title: string;
  subject: subject;
  class: Class;
  teacher: user;
  duration: number; // in minutes
  questions: question[];
  dueDate: Date;
  isActive: boolean;
  attempt?: examAttempt | null;
}

export interface Submission {
  _id: string;
  score: number;
  /** Sum of the questions' `points` — not the question count. */
  totalPoints?: number;
  exam: exam; // The populated exam with answers
  answers: { questionId: string; answer: string }[];
}

/**
 * The server-side clock for one student's sitting. Present on `GET /exams/:id`
 * only for a student who has not submitted yet; the deadline is the server's,
 * never one the client computed.
 */
export interface examAttempt {
  startedAt: string;
  expiresAt: string;
  remainingMs: number;
}

export interface period {
  _id: string;
  subject: { _id: string; name: string; code: string };
  teacher: { _id: string; name: string };
  startTime: string; // e.g., "08:00"
  endTime: string; // e.g., "08:45"
}

export interface schedule {
  day: string; // "Monday", "Tuesday", etc.
  periods: period[];
}

export type applicationStatus = "pending" | "reviewing" | "accepted" | "rejected";

export interface application {
  _id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  program: string;
  message?: string | null;
  status: applicationStatus;
  /** Set once an admin accepts and the student account exists. */
  userId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Returned once, by the accept call only. The temporary password is not stored
 * in readable form anywhere, so this response is the admin's only copy.
 */
export interface acceptedAccount {
  userId: string;
  email: string;
  created: boolean;
  temporaryPassword?: string;
  note: string;
}
