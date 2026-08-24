"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "@/lib/ui-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Bell, CheckCheck, Mail, Volume2 } from "lucide-react";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

export function NotificationsView() {
  const setView = useUIStore((s) => s.setView);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications", { credentials: "same-origin" });
      const j = await res.json();
      return j.data?.items ?? [];
    },
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/notifications?mark_read=${id}`, {
        method: "POST",
        credentials: "same-origin",
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const items = data?.filter((n: any) => !n.isRead) ?? [];
      await Promise.all(
        items.map((n: any) =>
          fetch(`/api/notifications?mark_read=${n.id}`, { method: "POST", credentials: "same-origin" })
        )
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unread = data?.filter((n: any) => !n.isRead).length ?? 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <button onClick={() => setView("dashboard")} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="h-4 w-4" />لوحة التحكم
      </button>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Bell className="h-6 w-6 text-primary" />الإشعارات</h1>
          <p className="text-sm text-muted-foreground">{unread} غير مقروء</p>
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
            <CheckCheck className="h-4 w-4" />تعليم الكل كمقروء
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex min-h-[20vh] items-center justify-center text-muted-foreground">جارٍ التحميل…</div>
      ) : data?.length === 0 ? (
        <Card className="glass p-8 text-center">
          <Bell className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">لا توجد إشعارات</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {data?.map((n: any, i: number) => (
            <motion.div key={n.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card
                className={`glass border p-4 ${n.isRead ? "border-[var(--glass-border)]" : "border-primary/40 bg-primary/5"}`}
              >
                <div className="flex items-start gap-3">
                  <div className="shrink-0">
                    {n.isBroadcast ? (
                      <Volume2 className="h-5 w-5 text-info" />
                    ) : (
                      <Mail className="h-5 w-5 text-accent" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold">{n.title}</h3>
                      {!n.isRead && <Badge className="text-primary" variant="secondary">جديد</Badge>}
                    </div>
                    <p
                      className="mt-1 text-sm text-muted-foreground"
                      dangerouslySetInnerHTML={{ __html: n.message }}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: ar })}
                    </p>
                  </div>
                  {!n.isRead && (
                    <Button variant="ghost" size="sm" onClick={() => markRead.mutate(n.id)}>
                      <CheckCheck className="h-4 w-4" />مقروء
                    </Button>
                  )}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
