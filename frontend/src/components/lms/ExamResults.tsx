import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Users } from "lucide-react";

import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Person {
  _id: string;
  name: string;
  email: string;
}

interface Results {
  exam: { _id: string; title: string; totalPoints: number };
  submissions: Array<{
    _id: string;
    student: Person | string;
    score: number;
    totalPoints: number;
    submittedAt: string;
  }>;
  outstanding: Array<Person | string>;
  stats: {
    submitted: number;
    outstanding: number;
    average: number | null;
    highest: number | null;
  };
}

const name = (p: Person | string) => (typeof p === "string" ? "Unknown" : p.name);
const email = (p: Person | string) => (typeof p === "string" ? p : p.email);

/**
 * Submissions have always been graded and stored, but nothing listed them —
 * marked work was invisible to the teacher who set it.
 */
const ExamResults = ({ examId }: { examId: string }) => {
  const [data, setData] = useState<Results | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/exams/${examId}/submissions`);
        if (!cancelled) setData(res.data);
      } catch {
        if (!cancelled) toast.error("Could not load results");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading results…
      </div>
    );
  }
  if (!data) return null;

  const { stats, exam, submissions, outstanding } = data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Submitted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="display-page text-2xl tabular-nums">{stats.submitted}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Not yet sat</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="display-page text-2xl tabular-nums">{stats.outstanding}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="display-page text-2xl tabular-nums">
              {stats.average ?? "—"}
              {stats.average !== null && (
                <span className="text-base text-muted-foreground"> / {exam.totalPoints}</span>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Highest</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="display-page text-2xl tabular-nums">
              {stats.highest ?? "—"}
              {stats.highest !== null && (
                <span className="text-base text-muted-foreground"> / {exam.totalPoints}</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submissions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  Nobody has sat this exam yet.
                </TableCell>
              </TableRow>
            ) : (
              submissions.map((s) => {
                const pct = exam.totalPoints ? (s.score / exam.totalPoints) * 100 : 0;
                return (
                  <TableRow key={s._id}>
                    <TableCell>
                      <div className="font-medium">{name(s.student)}</div>
                      <div className="text-sm text-muted-foreground">{email(s.student)}</div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          pct >= 50
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                            : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                        }
                      >
                        {s.score} / {exam.totalPoints}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground tabular-nums">
                      {new Date(s.submittedAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {outstanding.length > 0 && (
        <div className="rounded-lg border bg-muted/40 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Users className="h-4 w-4" /> Still to sit it ({outstanding.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {outstanding.map((p, i) => (
              <Badge key={i} variant="outline">
                {name(p)}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamResults;
