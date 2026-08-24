"use client";

import { motion } from "framer-motion";
import { useAuth } from "@/components/auth-context";
import { useUIStore } from "@/lib/ui-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, Minus, X, Divide, Calculator, Trophy, Bot, Wallet, Bell, LogOut, Clock, Award, TrendingUp, User as UserIcon } from "lucide-react";

const TRAININGS = [
  { view: "game-add-sub" as const, title: "الجمع والطرح", desc: "تدريب على العمليات الحسابية الأساسية بسرعة ذهنية", icon: Plus, color: "from-blue-500 to-indigo-600" },
  { view: "game-mult" as const, title: "الضرب", desc: "احترف جدول الضرب بأرقام متعددة الخانات", icon: X, color: "from-orange-500 to-red-600" },
  { view: "game-div" as const, title: "القسمة", desc: "قسّم أرقاماً كبيرة بثقة وسرعة", icon: Divide, color: "from-cyan-500 to-blue-600" },
  { view: "game-abacus" as const, title: "الأباكوس (سوروبان)", desc: "تدريب على العدّاد الياباني لتنمية الإدراك البصري", icon: Calculator, color: "from-emerald-500 to-teal-600" },
];

const CHALLENGES = [
  { view: "pvp" as const, title: "ساحة المعارك", desc: "تحدّى زملاءك في مباريات حية", icon: Trophy, color: "from-yellow-500 to-amber-600" },
  { view: "exam-generator" as const, title: "مولّد الامتحانات", desc: "أنشئ امتحاناً مخصصاً وصدّره PDF", icon: Bot, color: "from-violet-500 to-purple-600" },
];

export function DashboardView() {
  const { user, logout, unreadNotifications } = useAuth();
  const setView = useUIStore((s) => s.setView);

  if (!user) return null;
  if (user.status === "pending") {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-md items-center px-4">
        <Card className="glass-strong border border-warning/30 p-8 text-center">
          <div className="mb-4 text-5xl">⏳</div>
          <h2 className="mb-2 text-xl font-bold">حسابك قيد المراجعة</h2>
          <p className="text-sm text-muted-foreground">تم إنشاء حسابك بنجاح. سيتم تفعيله بعد موافقة الإدارة (خلال 24 ساعة عادةً). سيتم إشعارك عبر البريد الإلكتروني.</p>
          <Button className="mt-6 gradient-primary text-white" onClick={() => logout()}><LogOut className="h-4 w-4" />تسجيل الخروج</Button>
        </Card>
      </div>
    );
  }
  if (user.status === "expired") {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-md items-center px-4">
        <Card className="glass-strong border border-destructive/30 p-8 text-center">
          <div className="mb-4 text-5xl">🚫</div>
          <h2 className="mb-2 text-xl font-bold">انتهت صلاحية حسابك</h2>
          <p className="text-sm text-muted-foreground">لقد انتهت مدة اشتراكك. يرجى التواصل مع الإدارة للتجديد.</p>
          <Button className="mt-6 gradient-primary text-white" onClick={() => logout()}><LogOut className="h-4 w-4" />تسجيل الخروج</Button>
        </Card>
      </div>
    );
  }

  const initial = user.studentName.charAt(0);
  const validityRemaining = user.validityEnd ? Math.max(0, Math.ceil((new Date(user.validityEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null;

  const navItems = [
    { view: "statistics" as const, label: "إحصائياتي", icon: TrendingUp },
    { view: "leaderboard" as const, label: "المتصدّرون", icon: Trophy },
    { view: "wallet" as const, label: "محفظتي", icon: Wallet },
    { view: "notifications" as const, label: "الإشعارات", icon: Bell, badge: unreadNotifications },
    { view: "profile" as const, label: "ملفي", icon: UserIcon },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <Card className="glass border border-[var(--glass-border)] p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14 gradient-primary">
                <AvatarFallback className="gradient-primary text-white font-bold text-xl">{initial}</AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-xl font-bold sm:text-2xl">مرحباً، {user.studentName.split(" ")[0]}! 🎯</h1>
                <p className="text-sm text-muted-foreground">@{user.username} · مستوى {user.level}{user.trainer && ` · مدرّبك: ${user.trainer.name}`}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="gap-1 glass" variant="secondary"><Award className="h-3 w-3 text-primary" /><span className="font-mono">{user.totalPoints}</span> نقطة</Badge>
              <Badge className="gap-1 glass" variant="secondary"><Trophy className="h-3 w-3 text-accent" /><span className="font-mono">{user.pvpPoints}</span> PVP</Badge>
              {validityRemaining !== null && (<Badge className="gap-1 glass" variant="secondary"><Clock className="h-3 w-3 text-warning" /><span className="font-mono">{validityRemaining}</span> يوم</Badge>)}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--glass-border)] pt-4">
            {navItems.map((n) => (
              <Button key={n.view} variant="outline" size="sm" className="glass relative" onClick={() => setView(n.view)}>
                <n.icon className="h-4 w-4" />
                {n.label}
                {n.badge ? (<span className="absolute -top-2 -left-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">{n.badge}</span>) : null}
              </Button>
            ))}
            <Button variant="ghost" size="sm" className="ml-auto text-destructive hover:text-destructive" onClick={() => { logout(); setView("landing"); }}><LogOut className="h-4 w-4" />خروج</Button>
          </div>
        </Card>
      </motion.div>

      <section className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold"><Calculator className="h-5 w-5 text-primary" />منطقة التدريب</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TRAININGS.map((t, i) => (
            <motion.div key={t.view} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.05 }}>
              <Card className="glass h-full cursor-pointer border border-[var(--glass-border)] p-4 transition-all hover:scale-[1.02] hover:border-primary/40" onClick={() => setView(t.view)}>
                <div className={`mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${t.color} text-white shadow-lg`}><t.icon className="h-6 w-6" /></div>
                <h3 className="mb-1 font-bold">{t.title}</h3>
                <p className="text-xs text-muted-foreground">{t.desc}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold"><Trophy className="h-5 w-5 text-accent" />التحدّيات</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {CHALLENGES.map((c, i) => (
            <motion.div key={c.view} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.05 }}>
              <Card className="glass h-full cursor-pointer border border-[var(--glass-border)] p-5 transition-all hover:scale-[1.01] hover:border-accent/40" onClick={() => setView(c.view)}>
                <div className="flex items-start gap-4">
                  <div className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${c.color} text-white shadow-lg`}><c.icon className="h-7 w-7" /></div>
                  <div className="flex-1">
                    <h3 className="mb-1 font-bold">{c.title}</h3>
                    <p className="text-sm text-muted-foreground">{c.desc}</p>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
