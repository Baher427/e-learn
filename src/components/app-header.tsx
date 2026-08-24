"use client";

/**
 * Legacy-style sticky glass header (from dashboard.php):
 *
 *  ┌──────────────────────────────────────────────────────────┐
 *  │ [avatar اسم الطالب / المستوى X]        🌙  🔔·  ☰        │
 *  └──────────────────────────────────────────────────────────┘
 *
 * - Guests see the e-learn logo instead of the avatar block.
 * - The bell shows a pulsing dot when there are unread
 *   notifications and jumps to the notifications view.
 * - The hamburger / avatar opens the user sidebar drawer.
 */
import { useAuth } from "@/components/auth-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { useUIStore } from "@/lib/ui-store";
import { Bell, Menu } from "lucide-react";

export function AppHeader() {
  const { user, unreadNotifications } = useAuth();
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setView = useUIStore((s) => s.setView);

  if (!user) {
    // Guests: minimal brand header (legacy index/login style)
    return (
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-3 sm:px-6">
        <a
          href="/"
          className="flex items-center gap-2 font-mono text-sm font-bold sm:text-base"
        >
          <span className="text-lg">🧠</span>
          <span className="gradient-text">e-learn</span>
        </a>
        <ThemeToggle />
      </div>
    );
  }

  const initial = user.studentName.charAt(0);
  const isApproved = user.status === "approved";

  return (
    <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-2 px-3 sm:px-6">
      {/* User chip (menu trigger) — legacy dashboard header */}
      <button
        type="button"
        onClick={toggleSidebar}
        className="group flex min-w-0 items-center gap-3 rounded-xl px-1 py-1 text-right transition hover:bg-white/5"
        aria-label="فتح قائمة البيانات"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-gradient-to-br from-indigo-500 to-purple-600 text-lg font-bold text-white shadow-md">
          {initial}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold leading-tight">
            {user.studentName}
          </h1>
          <span className="text-[10px] font-semibold text-muted-foreground">
            {user.role === "admin" ? "مدير المنصة" : `المستوى ${user.level}`}
          </span>
        </div>
      </button>

      {/* Actions */}
      <div className="flex items-center gap-1 sm:gap-2">
        <ThemeToggle />

        {/* Notifications bell with unread dot */}
        <button
          type="button"
          onClick={() => setView("notifications")}
          className="relative rounded-xl p-2 transition hover:bg-white/10"
          aria-label={`الإشعارات${unreadNotifications > 0 ? ` (${unreadNotifications} غير مقروء)` : ""}`}
        >
          <Bell className="h-5 w-5" />
          {unreadNotifications > 0 && (
            <>
              <span className="absolute right-1.5 top-1.5 flex h-2.5 w-2.5 animate-pulse rounded-full border-2 border-slate-900 bg-rose-500" />
              <span className="absolute -top-0.5 -left-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                {unreadNotifications > 9 ? "9+" : unreadNotifications}
              </span>
            </>
          )}
        </button>

        {/* Sidebar hamburger */}
        <button
          type="button"
          onClick={toggleSidebar}
          className="rounded-xl p-2 transition hover:bg-white/10"
          aria-label="فتح القائمة الجانبية"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
