"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth-context";
import { useUIStore } from "@/lib/ui-store";
import { Card } from "@/components/ui/card";
import { Trophy, Medal, Crown, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

interface Entry { rank: number; id: string; username: string; studentName: string; totalPoints: number; level: number }

export function LeaderboardView() {
  const { user } = useAuth();
  const setView = useUIStore((s) => s.setView);
  const { data, isLoading } = useQuery<{ leaderboard: Entry[]; me: { rank: number; totalPoints: number; totalUsers: number } }>({
    queryKey: ["leaderboard"],
    queryFn: async () => { const res = await fetch("/api/leaderboard", { credentials: "same-origin" }); const j = await res.json(); return j.data; },
    refetchInterval: 15_000,
  });

  const medals = [Crown, Medal, Trophy];

  if (isLoading) {
    return (<div className="flex min-h-[40vh] items-center justify-center"><div className="animate-pulse text-muted-foreground">جارٍ تحميل المتصدّرين…</div></div>);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <button onClick={() => setView("dashboard")} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="h-4 w-4" />لوحة التحكم</button>
      <div className="mb-6 text-center">
        <Trophy className="mx-auto mb-2 h-12 w-12 text-accent" />
        <h1 className="text-2xl font-bold">لوحة المتصدّرين</h1>
        <p className="text-sm text-muted-foreground">أقوى 10 طلاب هذا الأسبوع</p>
      </div>
      <div className="space-y-2">
        {data?.leaderboard.map((e, i) => {
          const isMe = e.id === user?.id;
          const Med = medals[i] ?? Trophy;
          return (
            <motion.div key={e.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: i * 0.05 }}>
              <Card className={`glass border p-3 sm:p-4 ${isMe ? "border-primary/50 bg-primary/5" : "border-[var(--glass-border)]"} ${i < 3 ? "ring-1 ring-accent/20" : ""}`}>
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-mono font-bold ${i === 0 ? "bg-yellow-500/20 text-yellow-500" : i === 1 ? "bg-gray-400/20 text-gray-400" : i === 2 ? "bg-orange-700/20 text-orange-700" : "glass text-muted-foreground"}`}>
                    {i < 3 ? <Med className="h-5 w-5" /> : e.rank}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{e.studentName}{isMe && <span className="mr-2 text-xs text-primary">(أنت)</span>}</div>
                    <div className="text-xs text-muted-foreground">@{e.username} · مستوى {e.level}</div>
                  </div>
                  <div className="text-left font-mono">
                    <div className="text-lg font-bold gradient-text">{e.totalPoints}</div>
                    <div className="text-[10px] text-muted-foreground">نقطة</div>
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
      {data && data.me.rank > 10 && (
        <Card className="glass mt-4 border border-primary/30 bg-primary/5 p-4 text-center">
          <p className="text-sm text-muted-foreground">ترتيبك الحالي</p>
          <p className="mt-1 font-mono text-2xl font-bold gradient-text">#{data.me.rank}</p>
          <p className="mt-1 text-xs text-muted-foreground">من إجمالي {data.me.totalUsers} طالب نشط</p>
        </Card>
      )}
    </div>
  );
}
