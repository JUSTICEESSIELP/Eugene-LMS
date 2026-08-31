import { createBrowserRouter } from "react-router"; // Keeping your requested import
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Apply from "@/pages/Apply";
import Applications from "@/pages/admissions/Applications";
import PrivateRoutes from "@/pages/routes/PrivateRoutes";
import Dashboard from "@/pages/Dashboard";
import AcademicYear from "@/pages/settings/academic-year";
import ActivitiesLog from "@/pages/settings/activities-log";
import UserManagementPage from "@/pages/users";
import Classes from "@/pages/academics/Classes";
import { Subjects } from "@/pages/academics/Subjects";
import Timetable from "@/pages/academics/Timetable";
import Exams from "@/pages/lms/Exams";
import Exam from "../lms/Exam";
import RouteError, { NotFound } from "@/pages/routes/RouteError";
import RequireRole from "@/pages/routes/RequireRole";

export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    children: [
      // public routes
      { index: true, element: <Home /> },
      { path: "login", element: <Login /> },
      { path: "apply", element: <Apply /> },

      // Everything below requires a session. Each group's `allow` list mirrors
      // what the API actually enforces — the sidebar hid these links, but the
      // router used to let anyone reach them by typing the URL.
      {
        element: <PrivateRoutes />,
        children: [
          // Open to every signed-in role.
          { path: "dashboard", element: <Dashboard /> },
          { path: "timetable", element: <Timetable /> },

          {
            element: <RequireRole allow={["admin"]} />,
            children: [
              { path: "activities-log", element: <ActivitiesLog /> },
              { path: "settings/academic-years", element: <AcademicYear /> },
              { path: "admissions", element: <Applications /> },
              // Only admins may read or write classes at the API.
              { path: "classes", element: <Classes /> },
              {
                path: "users/teachers",
                element: (
                  <UserManagementPage
                    role="teacher"
                    title="Teachers"
                    description="Manage teaching staff."
                  />
                ),
              },
              {
                path: "users/parents",
                element: (
                  <UserManagementPage
                    role="parent"
                    title="Parents"
                    description="Manage Parents."
                  />
                ),
              },
              {
                path: "users/admins",
                element: (
                  <UserManagementPage
                    role="admin"
                    title="Admins"
                    description="Manage Admins."
                  />
                ),
              },
            ],
          },

          {
            element: <RequireRole allow={["admin", "teacher"]} />,
            children: [
              { path: "subjects", element: <Subjects /> },
              {
                path: "users/students",
                element: (
                  <UserManagementPage
                    role="student"
                    title="Students"
                    description="Manage student directory and class assignments."
                  />
                ),
              },
            ],
          },

          {
            element: <RequireRole allow={["admin", "teacher", "student"]} />,
            children: [
              { path: "lms/exams", element: <Exams /> },
              { path: "lms/exams/:id", element: <Exam /> },
            ],
          },
        ],
      },

      // Anything else: rendered with the sidebar when signed in, so a wrong
      // turn never strands anyone outside the app.
      { path: "*", element: <NotFound /> },
    ],
  },
]);
