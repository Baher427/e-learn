"use client";

/**
 * Legacy-style user drawer (from dashboard.php) — slides in from the
 * LEFT edge (the legacy app opened it there):
 *
 *  ┌────────────────────────────┐
 *  │ [avatar 16]           ✕   │
 *  │ اسم الطالب                │
 *  │ @username                 │
 *  │ ● نشط                     │
 *  ├────────────────────────────┤
 *  │ بياناتي الدراسية            │
 *  │ 👨‍🏫 المدرب المسؤول  الاسم  │
 *  │ 📚 المستوى الدراسي  Lv.3   │
 *  │ 📅 نهاية الاشتراك  التاريخ │
 *  │ 📱 رقم الهاتف     01xxxxx │
 *  ├────────────────────────────┤
 *  │ 🚪 تسجيل الخروج            │
 *  └────────────────────────────┘
 */
import { useAuth } from "@/components/auth-context";
import { useUIStore } from "@/lib/ui-store";
import {
  X,
  GraduationCap,
  Layers,
  CalendarCheck,
  Smartphone,
  LogOut,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const STATUS_META: Record<
  string,
  { label: string; cls: string }
> = {
  approved: {
    label: "نشط",
    cls: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  },
  pending: {
    label: "قيد الانتظار",
    cls: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  },
  expired: {
    label: "منتهي",
    cls: "text-rose-400 border-rose-500/30 bg-rose-500/10",
  },
};

export function AppSidebar() {
  const { user, logout } = useAuth();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const setView = useUIStore((s) => s.setView);

  if (!user) return null;

  const initial = user.studentName.charAt(0);
  const status = STATUS_META[user.status] ?? STATUS_META.pending;

  const validityText = user.validityEnd
    ? new Date(user.validityEnd).toISOString().slice(0, 10)
    : "—";

  const handleLogout = async () => {
    setSidebarOpen(false);
    await logout();
    setView("landing");
  };

  return (
    <AnimatePresence>
      {sidebarOpen && (
        <>
          {/* Overlay */}
          <motion.div
            key="sidebar-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
          />

          {/* Drawer — slides in from the left edge (legacy behavior) */}
          <motion.aside
            key="sidebar-panel"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "tween", duration: 0.3, ease: "easeInOut" }}
            className="fixed top-0 left-0 z-[70] h-full w-80 max-w-[85vw] overflow-y-auto border-r border-white/10 bg-[var(--sidebar)] shadow-2xl backdrop-blur-xl"
            dir="rtl"
            aria-label="قائمة البيانات الشخصية"
          >
            {/* Header block */}
            <div className="border-b border-white/10 bg-gradient-to-b from-indigo-500/10 to-transparent p-6">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-white/10 bg-gradient-to-br from-indigo-600 to-purple-700 text-3xl font-bold text-white shadow-lg">
                  {initial}
                </div>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 transition hover:border-rose-500/20 hover:bg-rose-500/20 hover:text-rose-500"
                  aria-label="إغلاق القائمة"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <h2 className="text-xl font-bold">{user.studentName}</h2>
              <p className="mt-1 font-mono text-xs text-indigo-400" dir="ltr">
                @{user.username}
              </p>
              <div
                className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold ${status.cls}`}
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                {status.label}
              </div>
            </div>

            {/* بياناتي الدراسية */}
            <div className="space-y-2 p-4">
              <h3 className="mb-2 mt-2 px-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                بياناتي الدراسية
              </h3>

              <SidebarInfoRow
                icon={<GraduationCap className="h-5 w-5 text-indigo-500" />}
                label="المدرب المسؤول"
                value={user.trainer?.name ?? "غير محدد"}
              />
              <SidebarInfoRow
                icon={<Layers className="h-5 w-5 text-purple-500" />}
                label="المستوى الدراسي"
                badge={
                  <span className="rounded-md bg-purple-500/10 px-2 py-0.5 font-mono text-xs font-bold text-purple-500">
                    Level {user.level}
                  </span>
                }
              />
              <SidebarInfoRow
                icon={<CalendarCheck className="h-5 w-5 text-emerald-500" />}
                label="نهاية الاشتراك"
                badge={
                  <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 font-mono text-xs font-bold text-emerald-500">
                    {validityText}
                  </span>
                }
              />
              {user.phone && (
                <SidebarInfoRow
                  icon={<Smartphone className="h-5 w-5 text-blue-500" />}
                  label="رقم الهاتف"
                  value={user.phone}
                  mono
                  dirLtr
                />
              )}

              {/* Logout */}
              <button
                type="button"
                onClick={handleLogout}
                className="group mt-4 flex w-full items-center justify-between rounded-xl border border-transparent bg-transparent p-3 text-sm font-semibold text-muted-foreground transition hover:border-rose-500/20 hover:bg-rose-500/10 hover:text-rose-500"
              >
                <span className="flex items-center gap-3">
                  <LogOut className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-rose-500" />
                  تسجيل الخروج
                </span>
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function SidebarInfoRow({
  icon,
  label,
  value,
  badge,
  mono,
  dirLtr,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  badge?: React.ReactNode;
  mono?: boolean;
  dirLtr?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-transparent px-3 py-3 text-sm font-semibold text-muted-foreground">
      <span className="flex items-center gap-3">
        {icon}
        {label}
      </span>
      {badge ??
        (value && (
          <span
            className={`max-w-[45%] truncate text-xs font-bold text-foreground ${mono ? "font-mono" : ""}`}
            dir={dirLtr ? "ltr" : undefined}
          >
            {value}
          </span>
        ))}
    </div>
  );
}
