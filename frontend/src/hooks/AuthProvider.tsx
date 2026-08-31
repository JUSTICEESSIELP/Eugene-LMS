import { createContext, useState, useEffect, useContext } from "react";
import { api } from "@/lib/api";
import type { academicYear, user } from "@/types";

const AuthContext = createContext<{
  user: user | null;
  setUser: React.Dispatch<React.SetStateAction<user | null>>;
  loading: boolean;
  year: academicYear | null;
}>({
  user: null,
  setUser: () => {},
  loading: true,
  year: null,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<user | null>(null);
  const [loading, setLoading] = useState(true); // Prevents a flash of signed-out UI.
  const [year, setYear] = useState<academicYear | null>(null);

  useEffect(() => {
    // Guards against setting state after unmount, and against React 18's
    // double-invoked effects in development racing each other.
    let cancelled = false;

    const bootstrap = async () => {
      let signedIn: user | null = null;

      try {
        const { data } = await api.get("/users/profile");
        signedIn = data.user ?? null;
      } catch {
        // A 401 here is the normal answer for a signed-out visitor, not an
        // error worth logging — the landing page is mostly signed-out traffic.
        signedIn = null;
      }

      if (cancelled) return;
      setUser(signedIn);

      // The current academic year is behind auth, so asking for it while
      // signed out only produced a second 401. It is also only ever used by
      // the signed-in shell.
      if (signedIn) {
        try {
          const { data } = await api.get("/academic-years/current");
          if (!cancelled) setYear(data);
        } catch {
          // No year configured yet is a legitimate state: PrivateRoutes sends
          // an admin to the settings page to create one.
          if (!cancelled) setYear(null);
        }
      } else if (!cancelled) {
        setYear(null);
      }

      // Previously only the academic-year request cleared this, so a slow or
      // failed year lookup left the whole app rendering nothing.
      if (!cancelled) setLoading(false);
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, year }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
