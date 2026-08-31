import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle,
  Clock,
  Calendar,
  Award,
  ArrowLeft,
} from "lucide-react";

import { api } from "@/lib/api";
import { useAuth } from "@/hooks/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { exam, Submission } from "@/types";
import ExamRadio from "@/components/lms/ExamRadio";
import ExamResults from "@/components/lms/ExamResults";

/** mm:ss, or h:mm:ss for the long papers. */
const formatRemaining = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
};

const Exam = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isStudent = user?.role === "student";
  const isTeacher = user?.role === "teacher" || user?.role === "admin";

  const [exam, setExam] = useState<exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // Student Answers State: { [questionId]: "Selected Option" }
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submission, setSubmission] = useState<Submission | null>(null);
  // Milliseconds left in this student's window, from the server's clock.
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  // This was `exam.questions.length` — the question *count*, not the points
  // total. On a 5-question paper worth 10 points, an 8-point score rendered as
  // "8 / 5" and "160%". The API returns the real total on the submission.
  const totalPoints =
    submission?.totalPoints ??
    (exam ? exam.questions.reduce((sum, q) => sum + (Number(q.points) || 1), 0) : 0);
  const percentage =
    submission && totalPoints > 0
      ? Math.round((submission.score / totalPoints) * 100)
      : 0;

  // Fetch the exam, plus this student's own submission if they have one.
  //
  // This used to flip `loading` back to true after the exam had loaded and
  // only clear it again inside the `isStudent` branch — so for a teacher or
  // admin it never cleared, and the page sat on the spinner forever. Nobody
  // could open an exam to review or publish it.
  const fetch = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/exams/${id}`);
      setExam(data);
      // The server starts the clock when the paper is first opened and tells us
      // how long is left. We never compute the deadline locally — a client-side
      // timer is a display, not a control.
      setRemainingMs(data.attempt ? data.attempt.remainingMs : null);

      if (isStudent) {
        try {
          const result = await api.get(`/exams/${id}/result`);
          setSubmission(result.data);
        } catch {
          // No submission yet is the normal case, not an error.
          setSubmission(null);
        }
      }
    } catch {
      toast.error("Failed to load exam");
      navigate("/lms/exams");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetch();
  }, [id, navigate]);

  // Everything above this line is a hook, and every early return is below
  // it. Defining these after the `loading` / `!exam` returns changed the
  // number of hooks between renders and crashed the page with React #310
  // ("rendered more hooks than during the previous render").
  const handleStudentSubmit = useCallback(
    async ({ auto = false }: { auto?: boolean } = {}) => {
    if (!exam) return;

    // Time-up submits whatever is on the page: an unanswered question is worth
    // nothing either way, and refusing the submit would cost the student the
    // answers they did give.
    if (!auto && Object.keys(answers).length < exam.questions.length) {
      toast.error("Please answer all questions before submitting.");
      return;
    }

    try {
      setSubmitting(true);
      // Transform answers map to array for backend
      const payload = Object.entries(answers).map(([qId, ans]) => ({
        questionId: qId,
        answer: ans,
      }));

      const { data } = await api.post(`/exams/${id}/submit`, {
        answers: payload,
      });
      toast.success(
        auto
          ? `Time's up — your answers were submitted. Score: ${data.score}`
          : `Exam submitted! Score: ${data.score}`,
      );
      navigate("/lms/exams");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  },
    [exam, answers, id, navigate],
  );

  // Tick the countdown. `submittedRef` stops a re-render or a second tick from
  // firing the auto-submit twice.
  const submittedRef = useRef(false);
  useEffect(() => {
    if (remainingMs === null || submission) return;

    const deadline = Date.now() + remainingMs;
    const tick = () => {
      const left = deadline - Date.now();
      setRemainingMs(left > 0 ? left : 0);
      if (left <= 0 && !submittedRef.current) {
        submittedRef.current = true;
        // The server refuses a late submission regardless; this is what stops
        // the student losing the answers they already typed.
        void handleStudentSubmit({ auto: true });
      }
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
    // `remainingMs` is deliberately not a dependency: re-running on every tick
    // would restart the interval each second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission, handleStudentSubmit, remainingMs === null]);


  if (loading) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!exam) {
    navigate("/lms/exams");
    return;
  }

  if (!exam.isActive && !isTeacher) {
    navigate("/lms/exams");
    return;
  }

  const isExpired = exam.isActive && new Date() > new Date(exam.dueDate);
  if ((!exam.isActive || isExpired) && !isTeacher) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-4">
        <Clock className="h-12 w-12 text-accent-foreground" />
        <h2 className="text-xl font-bold">Exam Unavailable</h2>
        <p className="text-muted-foreground">
          This exam is currently closed or has expired.
        </p>
        <Button onClick={() => navigate("/lms/exams")}>Back to List</Button>
      </div>
    );
  }

  const handleTeacherDelete = async () => {
    if (!confirm("Are you sure you want to delete this exam?")) return;
    try {
      await api.delete(`/exams/${id}`); // Ensure delete route exists
      toast.success("Exam deleted");
      navigate("/lms/exams");
    } catch (error) {
      toast.error("Failed to delete");
    }
  };


  const handleToggleStatus = async () => {
    try {
      const { data } = await api.patch(`/exams/${id}/status`);
      toast.success(data.message);
      fetch(); // Refresh the list to update the UI
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to update status");
    }
  };
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="display-page text-3xl">{exam.title}</h1>
          <Badge variant={exam.isActive ? "default" : "secondary"}>
            {exam.isActive ? "Active" : "Draft"}
          </Badge>
        </div>
        <div className="flex gap-4 text-muted-foreground text-sm items-center">
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" /> {exam.duration} Minutes
          </div>
          {remainingMs !== null && !submission && (
            <Badge
              variant={remainingMs <= 60_000 ? "destructive" : "secondary"}
              className="font-mono tabular-nums"
            >
              {formatRemaining(remainingMs)} left
            </Badge>
          )}
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" /> Due:{" "}
            {new Date(exam.dueDate).toLocaleDateString()}
          </div>
        </div>
      </div>
      {/* to test logout and sign in as student */}
      {/* Teacher Control: Toggle Status */}
      {isTeacher && (
        <>
          <Separator />
          <div className="bg-card p-4 rounded-lg flex items-center justify-between border">
            <div className="text-lg font-semibold">Teacher Controls</div>
            <div className="flex gap-2 ml-2">
              <Button onClick={() => navigate("/lms/exams")}>
                Back to List
              </Button>
              <Button
                variant={exam.isActive ? "destructive" : "default"}
                onClick={handleToggleStatus}
              >
                {exam.isActive ? "Unpublish Exam" : "Publish Exam"}
              </Button>
              <Button variant="destructive" onClick={handleTeacherDelete}>
                Delete Exam
              </Button>
            </div>
          </div>
          <Separator />

          {/* Results were graded and stored all along; nothing displayed them. */}
          <div className="space-y-3">
            <h2 className="display-page text-2xl">Results</h2>
            {id && <ExamResults examId={id} />}
          </div>
          <Separator />
        </>
      )}

      {/* Student Results Section currently false */}
      {isStudent && submission && (
        <>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8 space-y-4">
              <div className="h-16 w-16 bg-yellow-100 rounded-full flex items-center justify-center">
                <Award className="h-8 w-8 text-yellow-600" />
              </div>
              <div className="text-center">
                <h1 className="display-page text-3xl">Exam Results</h1>
                <p className="text-muted-foreground">You scored</p>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-extrabold text-primary">
                  {submission.score}
                </span>
                <span className="text-2xl text-muted-foreground">
                  / {totalPoints}
                </span>
              </div>
              <Badge
                variant={percentage >= 50 ? "default" : "destructive"}
                className="text-lg px-4 py-1"
              >
                {percentage}%
              </Badge>
            </CardContent>
          </Card>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/lms/exams")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Quizzes
            </Button>
            <h2 className="text-xl font-semibold ml-auto">Review Answers</h2>
          </div>
        </>
      )}

      {/* questions list */}
      <div className="space-y-6">
        {exam.questions.map((q, index) => (
          <Card key={q._id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-medium flex gap-2">
                <span className="text-muted-foreground">{index + 1}.</span>
                {q.questionText}
                <span className="ml-auto text-xs font-normal text-muted-foreground bg-secondary px-2 py-1 rounded">
                  {q.points} pts
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isTeacher ? (
                // TEACHER VIEW: List options, highlight correct one
                <ul className="space-y-2">
                  {q.options.map((opt, i) => (
                    <li
                      key={i}
                      className={`p-3 rounded-md border flex items-center gap-2 ${
                        opt === q.correctAnswer
                          ? "bg-primary font-medium"
                          : "bg-black/20 dark:bg-black/70"
                      }`}
                    >
                      {opt === q.correctAnswer && (
                        <CheckCircle className="h-4 w-4" />
                      )}
                      {opt}
                    </li>
                  ))}
                </ul>
              ) : (
                // STUDENT VIEW: Radio Group
                <ExamRadio
                  answers={answers}
                  question={q}
                  setAnswers={setAnswers}
                  submission={submission}
                />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Footer Actions */}
      <div className="flex justify-end gap-4 pt-4">
        {isStudent && !submission && (
          <Button
            size="lg"
            className="w-full md:w-auto min-w-50"
            onClick={() => handleStudentSubmit()}
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              "Submit Exam"
            )}
          </Button>
        )}
      </div>
    </div>
  );
};
// show the result since I'm an admin
export default Exam;
