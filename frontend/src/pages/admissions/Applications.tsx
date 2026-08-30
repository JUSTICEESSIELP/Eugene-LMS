import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

import { api } from "@/lib/api";
import type { application, applicationStatus } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Search from "@/components/global/Search";
import CustomPagination from "@/components/global/CustomPagination";
import CustomAlert from "@/components/global/CustomAlert";

const STATUSES: applicationStatus[] = ["pending", "reviewing", "accepted", "rejected"];

const statusVariant: Record<applicationStatus, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  reviewing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  accepted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const Applications = () => {
  const [items, setItems] = useState<application[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchApplications = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append("page", pageNum.toString());
      params.append("limit", "10");
      if (debouncedSearch) params.append("search", debouncedSearch);
      if (status !== "all") params.append("status", status);

      const { data } = await api.get(`/applications?${params.toString()}`);
      setItems(data.applications ?? []);
      setTotalPages(data.pagination?.pages || 1);
    } catch {
      toast.error("Failed to fetch applications");
    } finally {
      setLoading(false);
    }
  }, [pageNum, debouncedSearch, status]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPageNum(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const updateStatus = async (id: string, next: applicationStatus) => {
    try {
      await api.patch(`/applications/${id}`, { status: next });
      setItems((prev) => prev.map((a) => (a._id === id ? { ...a, status: next } : a)));
      toast.success(`Marked as ${next}`);
    } catch {
      toast.error("Could not update the application");
    }
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      await api.delete(`/applications/${deletingId}`);
      toast.success("Application deleted");
      fetchApplications();
    } catch {
      toast.error("Could not delete the application");
    } finally {
      setIsAlertOpen(false);
      setDeletingId(null);
    }
  };

  return (
    <div className="p-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admissions</h1>
        <p className="text-muted-foreground">
          Applications submitted from the public “Apply Now” page.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <Search search={search} setSearch={setSearch} title="Search applicants..." />
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPageNum(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Applicant</TableHead>
              <TableHead>Programme</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                  No applications yet.
                </TableCell>
              </TableRow>
            ) : (
              items.map((a) => (
                <TableRow key={a._id}>
                  <TableCell>
                    <div className="font-medium">{a.fullName}</div>
                    <div className="text-sm text-muted-foreground">{a.email}</div>
                    {a.phone && (
                      <div className="text-sm text-muted-foreground">{a.phone}</div>
                    )}
                    {a.message && (
                      <p className="text-sm text-muted-foreground mt-1 max-w-md">
                        {a.message}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>{a.program}</TableCell>
                  <TableCell>{new Date(a.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge className={statusVariant[a.status]}>{a.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Select
                        value={a.status}
                        onValueChange={(v) => updateStatus(a._id, v as applicationStatus)}
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s[0].toUpperCase() + s.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setDeletingId(a._id);
                          setIsAlertOpen(true);
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
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

      <CustomAlert
        isOpen={isAlertOpen}
        setIsOpen={setIsAlertOpen}
        handleDelete={confirmDelete}
        title="Delete this application?"
        description="This permanently removes the applicant's submission."
      />
    </div>
  );
};

export default Applications;
