"use client";

import { createContext, useContext, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  studentName: string;
  phone?: string | null;
  role: "student" | "admin";
  status: "pending" | "approved" | "expired";
  level: number;
  totalPoints: number;
  pvpPoints: number;
  currentStatus: "idle" | "playing";
  validityEnd: string | null;
  trainer: { id: string; name: string } | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  unreadNotifications: number;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  unreadNotifications: 0,
  login: async () => {},
  logout: async () => {},
  refresh: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "same-origin" });
      if (!res.ok) return null;
      const json = await res.json();
      return json.data;
    },
    retry: false,
  });

  const loginMut = useMutation({
    mutationFn: async (vars: { username: string; password: string }) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(vars),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "فشل تسجيل الدخول");
      return json.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth", "me"] }),
  });

  const logoutMut = useMutation({
    mutationFn: async () => fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["auth", "me"] }),
  });

  return (
    <AuthContext.Provider
      value={{
        user: data?.user ?? null,
        isLoading,
        unreadNotifications: data?.unreadNotifications ?? 0,
        login: async (u, p) => {
          await loginMut.mutateAsync({ username: u, password: p });
        },
        logout: async () => {
          await logoutMut.mutateAsync();
        },
        refresh: () => qc.invalidateQueries({ queryKey: ["auth", "me"] }),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
