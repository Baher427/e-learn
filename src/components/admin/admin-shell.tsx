"use client";

/**
 * AdminShell — wraps every admin view with a sticky top navigation bar
 * containing the 7 admin links + logout. The links dispatch to the
 * Zustand ui-store; we never use <a href> navigation since this is an SPA.
 *
 * The shell also enforces admin-only access at render time (extra safety
 * beyond the API `requireAdmin()` check); if the auth context's user is
 * missing or non-admin, it returns null (the app-shell router already
 * redirects to dashboard/landing for non-admins, so this is a no-op
 * in practice but defensive).
 */
import { motion } from "framer-motion";
import { useAuth } from "@/components/auth-context";
import { useUIStore, ViewId } from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Users,
  GraduationCap,
  Swords,
  Wallet,
  Bell,
  FileText,
  BarChart3,
  LogOut,
} from "lucide-react";

type AdminKey =
  | "users"
  | "trainers"
  | "arena"
  | "withdrawals"
  | "notifications"
  | "exams"
  | "stats";

const NAV: { key: AdminKey; view: ViewId; label: string; icon: typeof Users }[] = [
  { key: "users", view: "admin-users", label: "المستخدمون", icon: Users },
  { key: "trainers", view: "admin-trainers", label: "المدرّبون", icon: GraduationCap },
  { key: "arena", view: "admin-arena", label: "الساحة الحية", icon: Swords },
  { key: "withdrawals", view: "admin-withdrawals", label: "طلبات السحب", icon: Wallet },
  { key: "notifications", view: "admin-notifications", label: "الإشعارات", icon: Bell },
  { key: "exams", view: "admin-exams", label: "الامتحانات", icon: FileText },
  { key: "stats", view: "admin-stats", label: "الإحصائيات", icon: BarChart3 },
];

interface Props {
  activeKey: AdminKey;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function AdminShell({ activeKey, title, subtitle, children }: Props) {
  const { user, logout } = useAuth();
  const setView = useUIStore((s) => s.setView);

  // Defensive guard — the app-shell already handles this, but we
  // double-check to prevent any admin UI flicker for non-admins.
  if (!user || user.role !== "admin") return null;

  const handleLogout = () => {
    logout();
    setView("landing");
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
      {/* ---------- Sticky nav bar ---------- */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-strong sticky top-14 z-40 mb-6 rounded-2xl border border-[var(--glass-border)] p-2 sm:p-3 shadow-lg"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {NAV.map((n) => {
            const isActive = n.key === activeKey;
            return (
              <Button
                key={n.key}
                variant={isActive ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "gap-1.5 font-medium",
                  isActive
                    ? "gradient-primary text-white shadow-md"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setView(n.view)}
              >
                <n.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{n.label}</span>
              </Button>
            );
          })}
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden text-left sm:block">
              <div className="text-xs font-bold leading-tight">{user.studentName}</div>
              <div className="text-[10px] text-muted-foreground">@{user.username}</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleLogout}
              title="تسجيل الخروج"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.div>

      {/* ---------- Page title ---------- */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-5"
      >
        <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </motion.div>

      {/* ---------- View body ---------- */}
      <div className="space-y-4">{children}</div>
    </div>
  );
}
