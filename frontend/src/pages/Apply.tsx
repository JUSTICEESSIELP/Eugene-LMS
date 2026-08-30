import { useState } from "react";
import { useForm, Controller, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, GraduationCap, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";

// Mirrors the programmes advertised on the landing page.
const PROGRAMS = [
  "Computer Science",
  "Neural Engineering",
  "Data Architecture",
  "Digital Arts",
  "Cyber Security",
];

const schema = z.object({
  fullName: z.string().min(2, "Please enter your full name").max(120),
  email: z.string().email("Please enter a valid email address").max(200),
  phone: z.string().max(40).optional().or(z.literal("")),
  program: z.string().min(1, "Please choose a programme"),
  message: z.string().max(2000).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

const Apply = () => {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: { fullName: "", email: "", phone: "", program: "", message: "" },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      setLoading(true);
      await api.post("/applications", values);
      setSubmitted(true);
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Could not submit your application");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-svh flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-6">
          <CheckCircle2 className="w-16 h-16 text-[#3ecf8e] mx-auto" />
          <h1 className="text-3xl font-bold">Application received</h1>
          <p className="text-muted-foreground">
            Thanks for applying to Edunexus. Our admissions team will review your
            application and get back to you by email.
          </p>
          <Button asChild className="bg-[#3ecf8e] text-black hover:bg-[#34b27b]">
            <Link to="/">Back to homepage</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-svh">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 space-y-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-[#3ecf8e] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to homepage
        </Link>

        <div className="space-y-3">
          <div className="inline-flex items-center gap-2">
            <div className="bg-[#3ecf8e] p-1.5 rounded-lg">
              <GraduationCap className="text-black w-5 h-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">
              EDU<span className="text-[#3ecf8e]">NEXUS</span>
            </span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Start your application</h1>
          <p className="text-muted-foreground">
            Tell us who you are and what you want to study. It takes about a minute —
            no account needed.
          </p>
        </div>

        <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FieldGroup className="space-y-5">
            <Controller
              name="fullName"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="fullName">Full name</FieldLabel>
                  <Input id="fullName" placeholder="Ada Mensah" {...field} />
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Controller
                name="email"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input id="email" type="email" placeholder="you@example.com" {...field} />
                    {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                  </Field>
                )}
              />
              <Controller
                name="phone"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="phone">Phone (optional)</FieldLabel>
                    <Input id="phone" placeholder="+233 …" {...field} />
                    {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                  </Field>
                )}
              />
            </div>

            <Controller
              name="program"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Programme</FieldLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a programme" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROGRAMS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />

            <Controller
              name="message"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="message">
                    Why this programme? (optional)
                  </FieldLabel>
                  <Textarea
                    id="message"
                    rows={5}
                    placeholder="A short note about your background and goals."
                    {...field}
                  />
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />
          </FieldGroup>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[#3ecf8e] text-black hover:bg-[#34b27b] font-bold py-6 text-base"
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Submit application
          </Button>

          <p className="text-sm text-muted-foreground text-center">
            Already a student or staff member?{" "}
            <Link to="/login" className="text-[#3ecf8e] font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Apply;
