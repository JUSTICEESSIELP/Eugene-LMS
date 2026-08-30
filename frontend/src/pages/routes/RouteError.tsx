import { Link, isRouteErrorResponse, useLocation, useRouteError } from "react-router";
import { Compass, Hammer, RotateCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/sidebar/AppSidebar";
import { useAuth } from "@/hooks/AuthProvider";

/**
 * Features that have a menu entry but no page yet. Landing on one of these is
 * not a mistake the visitor made, so it gets its own wording rather than the
 * generic "page not found".
 */
const PLANNED: Record<string, string> = {
  "/attendance": "Attendance",
  "/lms/assignments": "Assignments",
  "/lms/materials": "Study Materials",
  "/finance/fees": "Fee Collection",
  "/finance/expenses": "Expenses",
  "/finance/salary": "Salary",
  "/settings/general": "School Settings",
  "/settings/roles": "Roles & Permissions",
};

interface PanelProps {
  eyebrow: string;
  title: string;
  message: string;
  icon: React.ReactNode;
  detail?: string;
  showReload?: boolean;
}

const Panel = ({ eyebrow, title, message, icon, detail, showReload }: PanelProps) => {
  const { user } = useAuth();

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
          {icon}
        </div>

        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {eyebrow}
        </p>
        <h1 className="display-page text-3xl">{title}</h1>
        <p className="mt-3 text-muted-foreground">{message}</p>

        {detail && (
          <pre className="mt-4 overflow-x-auto rounded-lg border bg-muted/50 p-3 text-left text-xs text-muted-foreground">
            {detail}
          </pre>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link to={user ? "/dashboard" : "/"}>
              {user ? "Back to dashboard" : "Back to homepage"}
            </Link>
          </Button>
          {!user && (
            <Button asChild variant="outline">
              <Link to="/login">Sign in</Link>
            </Button>
          )}
          {showReload && (
            <Button variant="outline" onClick={() => window.location.reload()}>
              <RotateCw className="mr-2 h-4 w-4" />
              Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Signed-in visitors keep the sidebar, so a wrong turn does not strand them
 * outside the app with no way to navigate.
 */
const Frame = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  if (!user) return <>{children}</>;
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
};

/** Catch-all for any URL with no route behind it. */
export const NotFound = () => {
  const { pathname } = useLocation();
  const planned = PLANNED[pathname];

  return (
    <Frame>
      {planned ? (
        <Panel
          eyebrow="Coming soon"
          title={`${planned} isn't built yet`}
          message="This section is on the roadmap but has no page behind it today. Everything else in the menu works."
          icon={<Hammer className="h-6 w-6" />}
        />
      ) : (
        <Panel
          eyebrow="404"
          title="We can't find that page"
          message="The link may be out of date, or the address mistyped."
          icon={<Compass className="h-6 w-6" />}
          detail={pathname}
        />
      )}
    </Frame>
  );
};

/**
 * Root `errorElement`. Replaces React Router's built-in developer screen,
 * which leaked "Hey developer 👋" and a stack trace to end users.
 */
const RouteError = () => {
  const error = useRouteError();

  // A thrown 404 response lands here rather than in the catch-all route.
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFound />;
  }

  const detail =
    isRouteErrorResponse(error)
      ? `${error.status} ${error.statusText}`
      : error instanceof Error
        ? error.message
        : undefined;

  return (
    <Frame>
      <Panel
        eyebrow="Something went wrong"
        title="This page hit an error"
        message="The rest of the app is still fine. Try again, or head back and pick another section."
        icon={<TriangleAlert className="h-6 w-6" />}
        detail={detail}
        showReload
      />
    </Frame>
  );
};

export default RouteError;
