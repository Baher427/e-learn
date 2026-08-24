"use client";

import { useAuth } from "@/components/auth-context";
import { useUIStore } from "@/lib/ui-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, User, Mail, Phone, Award, Trophy, Clock, Calendar, LogOut } from "lucide-react";

export function ProfileView() {
  const { user, logout } = useAuth();
  const setView = useUIStore((s) => s.setView);
  if (!user) return null;

  const validityRemaining = user.validityEnd
    ? Math.max(0, Math.ceil((new Date(user.validityEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const rows = [
    { icon: User, label: "الاسم", value: user.studentName },
    { icon: Mail, label: "البريد", value: user.email, mono: true },
    ...(user.phone ? [{ icon: Phone, label: "الهاتف", value: user.phone, mono: true }] : []),
    { icon: Award, label: "المستوى", value: `مستوى ${user.level}`, mono: true },
    ...(user.trainer ? [{ icon: User, label: "المدرّب", value: user.trainer.name }] : []),
  ];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <button onClick={() => setView("dashboard")} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="h-4 w-4" />لوحة التحكم
      </button>

      <div className="mb-6 text-center">
        <Avatar className="mx-auto mb-3 h-20 w-20 gradient-primary">
          <AvatarFallback className="gradient-primary text-white text-3xl font-bold">
            {user.studentName.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <h1 className="text-2xl font-bold">{user.studentName}</h1>
        <p className="text-sm text-muted-foreground">@{user.username}</p>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Card className="glass border border-[var(--glass-border)] p-3 text-center">
          <Trophy className="mx-auto mb-1 h-5 w-5 text-accent" />
          <div className="font-mono text-lg font-bold">{user.pvpPoints}</div>
          <div className="text-[10px] text-muted-foreground">نقاط PVP</div>
        </Card>
        <Card className="glass border border-[var(--glass-border)] p-3 text-center">
          <Award className="mx-auto mb-1 h-5 w-5 text-primary" />
          <div className="font-mono text-lg font-bold">{user.totalPoints}</div>
          <div className="text-[10px] text-muted-foreground">نقاط التدريب</div>
        </Card>
        <Card className="glass border border-[var(--glass-border)] p-3 text-center">
          <Clock className="mx-auto mb-1 h-5 w-5 text-warning" />
          <div className="font-mono text-lg font-bold">{validityRemaining ?? "—"}</div>
          <div className="text-[10px] text-muted-foreground">يوم متبقّي</div>
        </Card>
      </div>

      <Card className="glass border border-[var(--glass-border)] p-5">
        <h2 className="mb-3 font-bold">معلومات الحساب</h2>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg glass p-2.5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <r.icon className="h-4 w-4" />
                {r.label}
              </div>
              <span className={`text-sm font-medium ${r.mono ? "font-mono" : ""}`} dir={r.mono ? "ltr" : undefined}>
                {r.value}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg glass p-2.5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            حالة الحساب
          </div>
          <Badge
            className={
              user.status === "approved" ? "text-success" :
              user.status === "pending" ? "text-warning" : "text-destructive"
            }
            variant="secondary"
          >
            {user.status === "approved" ? "نشط" : user.status === "pending" ? "قيد الانتظار" : "منتهي"}
          </Badge>
        </div>
      </Card>

      <Button
        variant="outline"
        className="mt-4 w-full text-destructive hover:text-destructive"
        onClick={() => { logout(); setView("landing"); }}
      >
        <LogOut className="h-4 w-4" />تسجيل الخروج
      </Button>
    </div>
  );
}
