import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import CustomPagination from "@/components/global/CustomPagination";

interface LogEntry {
  _id: string;
  action: string;
  details?: string | null;
  createdAt: string;
  user: { _id: string; name: string; email: string; role: string } | string;
}

const roleTone: Record<string, string> = {
  admin: "bg-accent text-accent-foreground",
  teacher: "bg-muted text-foreground",
  student: "bg-muted text-foreground",
  parent: "bg-muted text-foreground",
};

/**
 * Every write in the app is recorded server-side, and the API has always
 * paginated it — but /activities-log was wired to the Dashboard component, so
 * the audit trail existed and nobody could read it. This is that screen.
 */
const ActivitiesLog = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/activities?page=${pageNum}&limit=20`);
      setLogs(data.logs ?? []);
      setTotalPages(data.pages || 1);
      setTotal(data.total || 0);
    } catch {
      toast.error("Failed to load the activity log");
    } finally {
      setLoading(false);
    }
  }, [pageNum]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="p-4 space-y-6">
      <div>
        <h1 className="display-page text-3xl">Activity Log</h1>
        <p className="text-muted-foreground">
          Every create, update and delete across the system
          {total > 0 && ` — ${total} recorded`}.
        </p>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  Nothing recorded yet.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => {
                // The user is populated when the account still exists; a bare
                // id means it was deleted after the entry was written.
                const actor = typeof log.user === "string" ? null : log.user;
                return (
                  <TableRow key={log._id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground tabular-nums">
                      {new Date(log.createdAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </TableCell>
                    <TableCell>
                      {actor ? (
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{actor.name}</span>
                          <Badge className={roleTone[actor.role] ?? "bg-muted"}>
                            {actor.role}
                          </Badge>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Deleted account</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>{log.action}</div>
                      {log.details && (
                        <div className="text-sm text-muted-foreground">{log.details}</div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <CustomPagination
          loading={loading}
          page={pageNum}
          setPage={setPageNum}
          totalPages={totalPages}
        />
      </div>
    </div>
  );
};

export default ActivitiesLog;
