"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type AuthContextValue = {
  user: User | null;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({ user: null, refreshUser: async () => {} });

export function AuthProvider({
  initialUser,
  children,
}: {
  initialUser: User | null;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(initialUser);

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function refreshUser() {
    const supabase = createClient();
    const {
      data: { user: fresh },
    } = await supabase.auth.getUser();
    setUser(fresh);
  }

  return (
    <AuthContext.Provider value={{ user, refreshUser }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
