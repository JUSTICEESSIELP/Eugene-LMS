import { Sparkles, BrainCircuit } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  role?: string;
}

/**
 * AI Academic Advisor — not built yet, and now says so.
 *
 * This used to be a `setTimeout(2000)` and a hardcoded string per role, styled
 * to look like a finished analysis of the school's real data. The teacher
 * variant named three students who do not exist and reported quiz scores that
 * were never computed; the admin variant invented an attendance trend for a
 * feature the system has no table for. There is no insight endpoint on the API
 * and the client call was commented out.
 *
 * Same treatment the dashboard's other unbuilt figures got: say nothing rather
 * than say something invented. A confident wrong number is worse than a blank.
 */
export function AiInsightWidget({ role }: Props) {
  return (
    <Card className="bg-brand-soft border-0 shadow-sm overflow-hidden relative">
      <BrainCircuit className="absolute -right-6 -bottom-6 h-32 w-32 text-brand/10" />

      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-md font-semibold text-brand-strong flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> AI Academic Advisor
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="py-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Not available yet. Once{" "}
            {role === "student" ? "your results build up" : "there is enough data"},
            this will summarise real trends from your school — until then it has
            nothing to report.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
