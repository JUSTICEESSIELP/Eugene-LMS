import {
  Users,
  BookOpen,
  Clock,
  GraduationCap,
  CalendarDays,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface StatsProps {
  role: string;
  data: any; // In real app, define a strict interface
}

export function DashboardStats({ role, data }: StatsProps) {
  // --- ADMIN VIEW ---
  if (role === "admin") {
    return (
      <>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Students
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="display-page text-2xl">{data.totalStudents || 0}</div>
            <p className="text-xs text-muted-foreground">+12% from last year</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Teachers
            </CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="display-page text-2xl">{data.totalTeachers || 0}</div>
            <p className="text-xs text-muted-foreground">Active Staff</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Avg Attendance
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="display-page text-2xl">
              {data.avgAttendance ?? "—"}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.avgAttendance ? "Today's metrics" : "Not tracked yet"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Exams</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="display-page text-2xl">{data.activeExams || 0}</div>
            <p className="text-xs text-muted-foreground">Currently ongoing</p>
          </CardContent>
        </Card>
      </>
    );
  }

  // --- TEACHER VIEW ---
  if (role === "teacher") {
    return (
      <>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">My Classes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="display-page text-2xl">{data.myClassesCount || 0}</div>
            <p className="text-xs text-muted-foreground">Assigned sections</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Pending Grading
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="display-page text-2xl">{data.pendingGrading || 0}</div>
            <p className="text-xs text-muted-foreground">
              Submissions to review
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Next Class</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold truncate">
              {data.nextClass ?? "—"}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.nextClass ? data.nextClassTime : "Check your timetable"}
            </p>
          </CardContent>
        </Card>
      </>
    );
  }

  // --- STUDENT VIEW ---
  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Attendance</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="display-page text-2xl">{data.myAttendance ?? "—"}</div>
          <p className="text-xs text-muted-foreground">
            {data.myAttendance ? "This semester" : "Not tracked yet"}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Assignments</CardTitle>
          <BookOpen className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="display-page text-2xl">
            {data.pendingAssignments || 0}
          </div>
          <p className="text-xs text-muted-foreground">Due this week</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Next Exam</CardTitle>
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-xl font-bold truncate">
            {data.nextExam || "None"}
          </div>
          <p className="text-xs text-muted-foreground">
            {data.nextExamDate || "Keep studying!"}
          </p>
        </CardContent>
      </Card>
    </>
  );
}

// also an example
