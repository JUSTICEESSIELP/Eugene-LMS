import { Navigate, Outlet, useLocation } from "react-router";
import { ShieldOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/AuthProvider";
import type { UserRole } from "@/types";

/**
 * Route-level role gate.
 *
 * The sidebar has always filtered links by role, but the router never checked
 * anything — so any signed-in user could type /admissions or /users/admins and
 * get the full admin screen. The API refused their requests, so no data
 * leaked, but the UI was offering controls that could never work.
 */
const RequireRole = ({ allow }: { allow: UserRole[] }) => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (allow.includes(user.role)) return <Outlet />;

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <ShieldOff className="h-6 w-6" />
        </div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Not available to you
        </p>
        <h1 className="display-page text-3xl">This section is for other roles</h1>
        <p className="mt-3 text-muted-foreground">
          Your account is signed in as {user.role}. If you think you should have access,
          ask an administrator to change your role.
        </p>
        <div className="mt-8">
          <Button asChild>
            <a href="/dashboard">Back to dashboard</a>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RequireRole;
