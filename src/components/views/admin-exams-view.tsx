"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  FileText,
  Trash2,
  Loader2,
  Eye,
  ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface AdminExam {
  id: string;
  examTitle: string;
  questionsCount: number;
  operationTypes: string;
  settingsJson: string;
  createdAt: string;
}

interface AdminUserExams {
  id: string;
  studentName: string;
  username: string;
  level: number;
  examCount: number;
  exams: AdminExam[];
}

interface ExamsResponse {
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  users: AdminUserExams[];
}

const OP_LABELS: Record<string, string> = {
  add_sub: "جمع/طرح",
  multiply: "ضرب",
  divide: "قسمة",
  imagination: "خيالي",
};

function safeParse(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw);
    return typeof v === "object" && v ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function AdminExamsView() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [details, setDetails] = useState<AdminExam | null>(null);

  const { data, isLoading } = useQuery<ExamsResponse>({
    queryKey: ["admin", "exams", page],
    queryFn: async () => {
      const url = new URL("/api/admin/exams", window.location.origin);
      url.searchParams.set("page", String(page));
      const res = await fetch(url, { credentials: "same-origin" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "fetch error");
      return j.data;
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (examId: string) => {
      const res = await fetch("/api/admin/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "delete_exam", examId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "delete failed");
      return j.data;
    },
    onSuccess: () => {
      toast.success("تم حذف الامتحان");
      qc.invalidateQueries({ queryKey: ["admin", "exams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AdminShell activeKey="exams" title="إدارة الامتحانات" subtitle="الامتحانات المولّدة من قِبل الطلاب — مجمّعة حسب المستخدم">
      <Card className="glass border border-[var(--glass-border)] p-0">
        {isLoading ? (
          <div className="py-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : data && data.users.length > 0 ? (
          <Accordion type="multiple" className="px-2">
            {data.users.map((u) => (
              <AccordionItem key={u.id} value={u.id} className="border-[var(--glass-border)]">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex w-full items-center gap-3 pr-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full gradient-primary text-white text-sm font-bold">
                      {u.studentName.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1 text-right">
                      <div className="truncate font-bold">{u.studentName}</div>
                      <div className="text-[11px] text-muted-foreground">@{u.username} · مستوى {u.level}</div>
                    </div>
                    <Badge variant="secondary" className="font-mono">
                      <FileText className="h-3 w-3" />
                      <span className="num">{u.examCount}</span> امتحان
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 py-2">
                    {u.exams.map((e) => (
                      <div key={e.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--glass-border)] bg-input/20 p-2.5">
                        <FileText className="h-4 w-4 text-primary" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{e.examTitle}</div>
                          <div className="text-[11px] text-muted-foreground">
                            <span className="num">{e.questionsCount}</span> سؤال · {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true, locale: ar })}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {e.operationTypes.split(",").filter(Boolean).map((op) => (
                            <Badge key={op} variant="outline" className="text-[10px]">{OP_LABELS[op.trim()] ?? op}</Badge>
                          ))}
                        </div>
                        <Button size="icon" variant="ghost" title="تفاصيل" onClick={() => setDetails(e)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" title="حذف" onClick={() => {
                          if (confirm("حذف الامتحان نهائياً؟")) deleteMut.mutate(e.id);
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <div className="py-10 text-center text-muted-foreground">
            <FileText className="mx-auto mb-3 h-10 w-10" />
            <p className="text-sm">لا توجد امتحانات مولّدة بعد</p>
          </div>
        )}
      </Card>

      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 border-t border-[var(--glass-border)] p-3">
          <div className="text-xs text-muted-foreground">
            صفحة <span className="num">{page}</span> من <span className="num">{data.pagination.totalPages}</span>
            {" "}— إجمالي <span className="num">{data.pagination.total}</span> طالب
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="h-4 w-4" />السابق
            </Button>
            <Button size="sm" variant="outline" disabled={page >= data.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
              التالي
            </Button>
          </div>
        </div>
      )}

      {/* ---------- Details dialog ---------- */}
      <Dialog open={!!details} onOpenChange={(v) => !v && setDetails(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {details?.examTitle}
            </DialogTitle>
            <DialogDescription>
              <span className="num">{details?.questionsCount}</span> سؤال · {details?.operationTypes.split(",").map((o) => OP_LABELS[o.trim()] ?? o).join("، ")}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto rounded-md border border-[var(--glass-border)] p-3">
            {details && <SettingsGrid settingsJson={details.settingsJson} />}
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}

function SettingsGrid({ settingsJson }: { settingsJson: string }) {
  const parsed = safeParse(settingsJson);
  if (!parsed) {
    return <p className="text-center text-sm text-muted-foreground">إعدادات غير قابلة للقراءة</p>;
  }
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {Object.entries(parsed).map(([key, value]) => (
        <div key={key} className="rounded-md border border-[var(--glass-border)] bg-input/20 p-2">
          <dt className="text-[11px] text-muted-foreground">{key}</dt>
          <dd className="mt-0.5 truncate font-mono text-sm">{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
