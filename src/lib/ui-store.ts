"use client";

/**
 * Single-page-app view store. Since the user can only see the `/`
 * route, all "page" navigation happens via this store. Routes are
 * just string identifiers; the <AppShell /> component decides which
 * component to render for each.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewId =
  | "landing"
  | "login"
  | "register"
  | "dashboard"
  | "trainings" // setup chooser
  | "game-add-sub"
  | "game-mult"
  | "game-div"
  | "game-abacus"
  | "statistics"
  | "leaderboard"
  | "pvp"
  | "pvp-arena"
  | "exam-generator"
  | "wallet"
  | "notifications"
  | "admin-users"
  | "admin-trainers"
  | "admin-arena"
  | "admin-withdrawals"
  | "admin-notifications"
  | "admin-exams"
  | "admin-stats"
  | "profile";

interface GameState {
  view: ViewId;
  params: Record<string, string>;
  /** Legacy-style user info drawer (opens from the left edge). */
  sidebarOpen: boolean;
  setView: (view: ViewId, params?: Record<string, string>) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  reset: () => void;
}

export const useUIStore = create<GameState>()(
  persist(
    (set) => ({
      view: "landing",
      params: {},
      sidebarOpen: false,
      setView: (view, params = {}) => set({ view, params }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      reset: () => set({ view: "landing", params: {}, sidebarOpen: false }),
    }),
    {
      name: "elearn-ui",
      partialize: (s) => ({ view: s.view, params: s.params }),
    }
  )
);
