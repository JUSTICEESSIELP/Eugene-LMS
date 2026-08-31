import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import Logo from "@/components/global/Logo";

const MIN_LENGTH = 8;

/**
 * Choosing a new password, from the link in the reset email.
 *
 * The token arrives in the query string and is only ever posted back — it is
 * never stored, and the API burns it on first use.
 */
const ResetPassword = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters`);
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match");
      return;
    }

    setPending(true);
    try {
      await api.post("/users/reset-password", { token, password });
      setDone(true);
      toast.success("Password updated. You can sign in now.");
      setTimeout(() => navigate("/login"), 2500);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ??
          "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setPending(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-svh flex flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">This link is incomplete</h1>
        <p className="text-muted-foreground text-sm max-w-sm">
          Open the link from your reset email, or request a new one.
        </p>
        <Button asChild variant="outline">
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-svh flex flex-col items-center justify-center gap-6 p-6">
      <Link to="/" className="flex items-center gap-2 font-medium">
        <Logo markClassName="h-7 w-7" />
      </Link>

      <div className="w-full max-w-sm">
        {done ? (
          <div className="space-y-3 text-center">
            <CheckCircle2 className="h-9 w-9 text-primary mx-auto" />
            <h1 className="text-xl font-semibold">Password updated</h1>
            <p className="text-muted-foreground text-sm">
              Taking you to the sign-in page. Any other devices you were signed
              in on have been signed out.
            </p>
            <Button asChild className="mt-2">
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-5">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold">Choose a new password</h1>
              <p className="text-muted-foreground text-sm">
                At least {MIN_LENGTH} characters. This link works once.
              </p>
            </div>

            <Field>
              <FieldLabel htmlFor="reset-password">New password</FieldLabel>
              <Input
                id="reset-password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="reset-confirm">Confirm new password</FieldLabel>
              <Input
                id="reset-confirm"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </Field>

            {error && <p className="text-destructive text-sm">{error}</p>}

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Saving..." : "Save new password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
