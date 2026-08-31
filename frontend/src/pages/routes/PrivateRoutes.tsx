import { useAuth } from "@/hooks/AuthProvider";
import { Navigate, Outlet, useLocation } from "react-router";
import { Loader2, CalendarX } from "lucide-react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/sidebar/AppSidebar";

const PrivateRoutes = () => {
  const { loading, user, year } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!year) {
    // Scenario A: Admin needs to create a year
    if (user.role === "admin") {
      // CRITICAL: Only redirect if they are NOT ALREADY on the settings page.
      // If we don't check this, it causes an infinite loop (Blank Page).
      if (location.pathname !== "/settings/academic-years") {
        return <Navigate to="/settings/academic-years" replace />;
      }
      // If they ARE on the settings page, we let code flow down to render the Sidebar/Outlet
    }
    // Scenario B: non-admins cannot use the system without an active year.
    //
    // This used to `<Navigate to="/login">`, which is the same infinite loop the
    // admin branch above is commented as guarding against: /login sees a signed-in
    // user and sends them straight back to /dashboard, which lands here again.
    // The result was a blank white page and no way into the app for every
    // teacher, student and parent — which is also the state a freshly seeded
    // school is in, before anyone marks a year current.
    //
    // A dead end that explains itself beats a redirect that cannot terminate.
    else {
      return (
        <div className="h-screen w-full flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-3">
            <CalendarX className="h-10 w-10 text-muted-foreground mx-auto" />
            <h1 className="text-xl font-semibold">The school year isn't set up yet</h1>
            <p className="text-muted-foreground text-sm">
              An administrator needs to mark an academic year as current before
              classes, timetables and exams can be used. Nothing is wrong with
              your account — please check back shortly.
            </p>
          </div>
        </div>
      );
    }
  }
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
};

export default PrivateRoutes;
