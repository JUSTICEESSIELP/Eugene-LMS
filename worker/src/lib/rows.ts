export type Row = Record<string, any>;

/**
 * D1 rows -> the JSON shapes the frontend already expects from Mongoose:
 * `_id` instead of `id`, real booleans, parsed JSON columns.
 */
const json = <T>(raw: unknown, fallback: T): T => {
  if (typeof raw !== "string") return (raw as T) ?? fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const bool = (v: unknown) => v === 1 || v === true;

const base = (row: Row): Row => {
  const { id, ...rest } = row;
  return { _id: id, ...rest };
};

export const userOut = (row: Row, opts: { password?: boolean } = {}): Row => {
  const out: Row = {
    ...base(row),
    isActive: bool(row.isActive),
    teacherSubject: json<string[]>(row.teacherSubject, []),
    studentClass: row.studentClass ?? null,
  };
  if (!opts.password) delete out.password;
  // Internal bookkeeping for token revocation. Nothing outside `protect` has any
  // use for it, and it would otherwise ride along in every user payload.
  delete out.sessionEpoch;
  return out;
};

export const academicYearOut = (row: Row): Row => ({
  ...base(row),
  isCurrent: bool(row.isCurrent),
});

export const subjectOut = (row: Row): Row => ({
  ...base(row),
  isActive: bool(row.isActive),
  teacher: json<string[]>(row.teacher, []),
});

export const classOut = (row: Row): Row => ({
  ...base(row),
  subjects: json<string[]>(row.subjects, []),
  students: json<string[]>(row.students, []),
});

export const timetableOut = (row: Row): Row => ({
  ...base(row),
  schedule: json<any[]>(row.schedule, []),
});

export const examOut = (row: Row, opts: { answers?: boolean } = {}): Row => {
  const questions = json<any[]>(row.questions, []).map((q) => {
    const copy = { ...q };
    if (!opts.answers) delete copy.correctAnswer;
    return copy;
  });
  return {
    ...base(row),
    isActive: bool(row.isActive),
    questions,
  };
};

export const submissionOut = (row: Row): Row => ({
  ...base(row),
  answers: json<any[]>(row.answers, []),
});

export const activityOut = (row: Row): Row => base(row);

export { json as parseJson, bool as toBool };
