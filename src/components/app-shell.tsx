"use client";

/**
 * The SPA router. Reads the current view from the Zustand ui-store
 * and renders the matching component. Auto-redirects: if the user
 * is not authenticated, only "landing", "login", "register" are
 * reachable; any other view falls back to landing.
 *
 * The current user (if any) is fetched once on mount via React Query
 * and exposed via the useAuth() hook.
 */
import { useQuery } from "@tanstack/react-query";
import { useUIStore, ViewId } from "@/lib/ui-store";
import { useAuth, AuthProvider } from "@/components/auth-context";
import { LandingView } from "@/components/views/landing-view";
import { LoginView } from "@/components/views/login-view";
import { RegisterView } from "@/components/views/register-view";
import { DashboardView } from "@/components/views/dashboard-view";
import { TrainingsView } from "@/components/views/trainings-view";
import { GameView } from "@/components/views/game-view";
import { StatisticsView } from "@/components/views/statistics-view";
import { LeaderboardView } from "@/components/views/leaderboard-view";
import { ExamGeneratorView } from "@/components/views/exam-generator-view";
import { PvpView } from "@/components/views/pvp-view";
import { PvpArenaView } from "@/components/views/pvp-arena-view";
import { WalletView } from "@/components/views/wallet-view";
import { NotificationsView } from "@/components/views/notifications-view";
import { AdminUsersView } from "@/components/views/admin-users-view";
import { AdminTrainersView } from "@/components/views/admin-trainers-view";
import { AdminArenaView } from "@/components/views/admin-arena-view";
import { AdminWithdrawalsView } from "@/components/views/admin-withdrawals-view";
import { AdminNotificationsView } from "@/components/views/admin-notifications-view";
import { AdminExamsView } from "@/components/views/admin-exams-view";
import { AdminStatsView } from "@/components/views/admin-stats-view";
import { ProfileView } from "@/components/views/profile-view";
import { Loader2 } from "lucide-react";

const GUEST_VIEWS: ViewId[] = ["landing", "login", "register"];
const ADMIN_VIEWS: ViewId[] = [
  "admin-users",
  "admin-trainers",
  "admin-arena",
  "admin-withdrawals",
  "admin-notifications",
  "admin-exams",
  "admin-stats",
];

function ViewRenderer() {
  const view = useUIStore((s) => s.view);
  const params = useUIStore((s) => s.params);
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Guard: unauthenticated users can only see guest views
  const isGuest = !user;
  if (isGuest && !GUEST_VIEWS.includes(view)) {
    return <LandingView />;
  }
  // Guard: only admins can see admin views
  if (user && user.role !== "admin" && ADMIN_VIEWS.includes(view)) {
    return <DashboardView />;
  }
  // Guard: only students should see student-only views (not admins)
  if (user && user.role === "admin" && ["dashboard", "trainings", "game-add-sub", "game-mult", "game-div", "game-abacus", "statistics", "pvp", "pvp-arena", "wallet"].includes(view)) {
    return <AdminUsersView />;
  }

  switch (view) {
    case "landing":
      return <LandingView />;
    case "login":
      return <LoginView />;
    case "register":
      return <RegisterView />;
    case "dashboard":
      return <DashboardView />;
    case "trainings":
      return <TrainingsView />;
    case "game-add-sub":
    case "game-mult":
    case "game-div":
    case "game-abacus":
      return <GameView view={view} params={params} />;
    case "statistics":
      return <StatisticsView />;
    case "leaderboard":
      return <LeaderboardView />;
    case "exam-generator":
      return <ExamGeneratorView />;
    case "pvp":
      return <PvpView />;
    case "pvp-arena":
      return <PvpArenaView params={params} />;
    case "wallet":
      return <WalletView />;
    case "notifications":
      return <NotificationsView />;
    case "admin-users":
      return <AdminUsersView />;
    case "admin-trainers":
      return <AdminTrainersView />;
    case "admin-arena":
      return <AdminArenaView />;
    case "admin-withdrawals":
      return <AdminWithdrawalsView />;
    case "admin-notifications":
      return <AdminNotificationsView />;
    case "admin-exams":
      return <AdminExamsView />;
    case "admin-stats":
      return <AdminStatsView />;
    case "profile":
      return <ProfileView />;
    default:
      return <LandingView />;
  }
}

export function AppShell() {
  return (
    <AuthProvider>
      <ViewRenderer />
    </AuthProvider>
  );
}
