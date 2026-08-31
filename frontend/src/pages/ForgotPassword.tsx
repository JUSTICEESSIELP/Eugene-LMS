import { useState } from "react";
import { Link } from "react-router";
import { MailCheck } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import Logo from "@/components/global/Logo";

/**
 * Asking for a reset link.
 *
 * The screen deliberately says the same thing whether or not the address has an
 * account — the API answers identically for the same reason. Telling a stranger
 * "no account with that email" turns this page into a way to find out who
 * studies here.
 */
const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api.post("/users/forgot-password", { email });
      setSent(true);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ??
          "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-svh flex flex-col items-center justify-center gap-6 p-6">
      <Link to="/" className="flex items-center gap-2 font-medium">
        <Logo markClassName="h-7 w-7" />
      </Link>

      <div className="w-full max-w-sm">
        {sent ? (
          <div className="space-y-3 text-center">
            <MailCheck className="h-9 w-9 text-primary mx-auto" />
            <h1 className="text-xl font-semibold">Check your inbox</h1>
            <p className="text-muted-foreground text-sm">
              If that address has an account, a reset link is on its way. It
              works once and expires in an hour.
            </p>
            <Button asChild variant="outline" className="mt-2">
              <Link to="/login">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-5">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold">Reset your password</h1>
              <p className="text-muted-foreground text-sm">
                Enter the email address on your account and we'll send you a
                link to choose a new password.
              </p>
            </div>

            <Field>
              <FieldLabel htmlFor="forgot-email">Email</FieldLabel>
              <Input
                id="forgot-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>

            {error && <p className="text-destructive text-sm">{error}</p>}

            <Button type="submit" className="w-full" disabled={pending || !email}>
              {pending ? "Sending..." : "Send reset link"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Remembered it?{" "}
              <Link to="/login" className="underline underline-offset-4">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
