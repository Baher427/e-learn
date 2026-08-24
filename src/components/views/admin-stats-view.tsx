"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Brain,
  Check,
  Trophy,
  Gamepad2,
  Loader2,
  Trash2,
  Eye,
  Search,
  User as UserIcon,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { useUIStore } from "@/lib/ui-store";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface OverviewResponse {
  overview: {
    totalTrainings: number;
    totalCorrect: number;
    topStudent: { id: string; studentName: string; username: string; totalPoints: number } | null;
    popularGame: { key: string; label: string } | null;
  };
  sevenDaysActivity: { date: string; count: number }[];
  gameDist: { name: string; value: number; key: string }[];
}

interface TableItem {
  id: string;
  userId: string;
  studentName: string;
  username: string;
  gameType: string;
  gameLabel: string;
  correctCount: number;
  questionCount: number;
  resultsJson: string;
  createdAt: string;
}

interface TableResponse {
  items: TableItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

interface UserDetailResponse {
  user: { id: string; studentName: string; username: string; totalPoints: number; level: number };
  trainings: {
    id: string;
    gameType: string;
    gameLabel: string;
    correctCount: number;
    questionCount: number;
    averageScore: number;
    createdAt: string;
  }[];
  totalCount: number;
}

const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function safeParse(raw: string): Array<{ question?: string; userAnswer?: string | number | null; correctAnswer?: string | number | null; isCorrect?: boolean }> {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function fmtDay(d: string): string {
  // YYYY-MM-DD -> e.g. "السبت"
  try {
    return new Date(d).toLocaleDateString("ar-EG", { weekday: "short" });
  } catch {
    return d;
  }
}

export function AdminStatsView() {
  const params = useUIStore((s) => s.params);
  const setView = useUIStore((s) => s.setView);
  const qc = useQueryClient();
  const userIdFromParams = params.user_id ?? null;
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [gameType, setGameType] = useState("all");
  const [page, setPage] = useState(1);
  const [detailsItem, setDetailsItem] = useState<TableItem | null>(null);

  // Track an explicit local override. We can't call setState-in-effect, so
  // we use the URL params store as the source of truth for the current
  // drill-down target. Local clicks call setView("admin-stats", { user_id }).
  const userDetailId = userIdFromParams || null;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data: overviewData, isLoading: overviewLoading } = useQuery<OverviewResponse>({
    queryKey: ["admin", "stats", "overview"],
    queryFn: async () => {
      const res = await fetch("/api/admin/stats?action=overview", { credentials: "same-origin" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "fetch");
      return j.data;
    },
  });

  const { data: tableData, isLoading: tableLoading } = useQuery<TableResponse>({
    queryKey: ["admin", "stats", "table", debounced, gameType, page],
    queryFn: async () => {
      const url = new URL("/api/admin/stats", window.location.origin);
      url.searchParams.set("action", "filtered_table");
      if (debounced) url.searchParams.set("q", debounced);
      url.searchParams.set("game_type", gameType);
      url.searchParams.set("page", String(page));
      const res = await fetch(url, { credentials: "same-origin" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "fetch");
      return j.data;
    },
  });

  const { data: userDetail, isLoading: userDetailLoading } = useQuery<UserDetailResponse>({
    queryKey: ["admin", "stats", "user_detail", userDetailId],
    queryFn: async () => {
      if (!userDetailId) return null as never;
      const res = await fetch(`/api/admin/stats?action=user_detail&user_id=${userDetailId}`, { credentials: "same-origin" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "fetch");
      return j.data;
    },
    enabled: !!userDetailId,
  });

  const deleteTrainingMut = useMutation({
    mutationFn: async (trainingId: string) => {
      const res = await fetch("/api/admin/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "delete_training", trainingId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "delete failed");
      return j.data;
    },
    onSuccess: () => {
      toast.success("تم حذف التدريب");
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      setDetailsItem(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetUserTrainingsMut = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch("/api/admin/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "reset_user_trainings", userId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "reset failed");
      return j.data;
    },
    onSuccess: (d: { deleted: number }) => {
      toast.success(`تم مسح ${d.deleted} تدريب`);
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---------- User detail panel ---------- //
  if (userDetailId) {
    return (
      <AdminShell activeKey="stats" title="تفاصيل الطالب" subtitle="عرض تدريبات الطالب وخيار مسح الكل">
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => {
            setView("admin-stats", {});
          }}>
            <Search className="h-4 w-4" />رجوع للجدول
          </Button>
          {userDetail && (
            <Button
              variant="destructive"
              size="sm"
              disabled={resetUserTrainingsMut.isPending}
              onClick={() => {
                if (confirm(`مسح جميع تدريبات ${userDetail.user.studentName} نهائياً؟`)) {
                  resetUserTrainingsMut.mutate(userDetail.user.id);
                }
              }}
            >
              <RotateCcw className="h-4 w-4" />مسح كل التدريبات
            </Button>
          )}
        </div>

        {userDetailLoading || !userDetail ? (
          <div className="py-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
        ) : (
          <>
            <Card className="glass border border-[var(--glass-border)] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full gradient-primary text-white text-sm font-bold">
                  {userDetail.user.studentName.charAt(0)}
                </div>
                <div>
                  <div className="font-bold">{userDetail.user.studentName}</div>
                  <div className="text-xs text-muted-foreground">@{userDetail.user.username} · مستوى {userDetail.user.level}</div>
                </div>
                <div className="ml-auto text-left">
                  <div className="font-mono text-xl font-bold">{userDetail.totalPoints}</div>
                  <div className="text-[11px] text-muted-foreground">نقطة كلية</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md border border-[var(--glass-border)] bg-input/20 p-2">
                  <div className="font-mono text-lg">{userDetail.totalCount}</div>
                  <div className="text-[10px] text-muted-foreground">تدريب</div>
                </div>
                <div className="rounded-md border border-[var(--glass-border)] bg-input/20 p-2">
                  <div className="font-mono text-lg">{userDetail.trainings.length}</div>
                  <div className="text-[10px] text-muted-foreground">معروض</div>
                </div>
                <div className="rounded-md border border-[var(--glass-border)] bg-input/20 p-2">
                  <div className="font-mono text-lg">{userDetail.user.level}</div>
                  <div className="text-[10px] text-muted-foreground">المستوى</div>
                </div>
              </div>
            </Card>

            <Card className="glass border border-[var(--glass-border)] p-0">
              <div className="max-h-[55vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[var(--glass-border)] hover:bg-transparent">
                      <TableHead className="text-xs">اللعبة</TableHead>
                      <TableHead className="text-xs">النتيجة</TableHead>
                      <TableHead className="text-xs hidden sm:table-cell">الدقة</TableHead>
                      <TableHead className="text-xs">التاريخ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userDetail.trainings.map((t) => (
                      <TableRow key={t.id} className="border-[var(--glass-border)]">
                        <TableCell className="text-sm">{t.gameLabel}</TableCell>
                        <TableCell className="font-mono text-sm">{t.correctCount}/{t.questionCount}</TableCell>
                        <TableCell className="font-mono text-sm hidden sm:table-cell">{Math.round(t.averageScore)}%</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(t.createdAt), { addSuffix: true, locale: ar })}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </>
        )}
      </AdminShell>
    );
  }

  // ---------- Default stats view ---------- //
  return (
    <AdminShell activeKey="stats" title="الإحصائيات العامة" subtitle="نظرة شاملة على نشاط المنصة">
      {/* ---------- 4 overview cards ---------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <OverviewCard icon={Brain} label="إجمالي التدريبات" value={overviewData?.overview.totalTrainings ?? 0} tone="primary" />
        <OverviewCard icon={Check} label="إجمالي الصحيح" value={overviewData?.overview.totalCorrect ?? 0} tone="success" />
        <OverviewCard icon={Trophy} label="الأفضل" value={overviewData?.overview.topStudent?.studentName ?? "—"} tone="warning" isText />
        <OverviewCard icon={Gamepad2} label="اللعبة الأكثر" value={overviewData?.overview.popularGame?.label ?? "—"} tone="info" isText />
      </div>

      {/* ---------- 7-day activity + doughnut ---------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="glass border border-[var(--glass-border)] p-4 lg:col-span-2">
          <h3 className="mb-3 font-bold">آخر 7 أيام — نشاط التدريب</h3>
          {overviewLoading ? (
            <div className="h-64 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={overviewData?.sevenDaysActivity ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="date" tickFormatter={fmtDay} stroke="rgba(255,255,255,0.5)" fontSize={12} />
                <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--glass-border)",
                    borderRadius: 8,
                    color: "var(--popover-foreground)",
                  }}
                  labelFormatter={(v) => fmtDay(String(v))}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="var(--chart-1)"
                  strokeWidth={3}
                  dot={{ r: 4, fill: "var(--chart-1)" }}
                  activeDot={{ r: 6 }}
                  name="التدريبات"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="glass border border-[var(--glass-border)] p-4">
          <h3 className="mb-3 font-bold">توزيع الألعاب</h3>
          {overviewLoading ? (
            <div className="h-64 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (overviewData?.gameDist.length ?? 0) > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={overviewData?.gameDist ?? []}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={40}
                  paddingAngle={2}
                >
                  {(overviewData?.gameDist ?? []).map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--glass-border)",
                    borderRadius: 8,
                    color: "var(--popover-foreground)",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">لا توجد بيانات</div>
          )}
        </Card>
      </div>

      {/* ---------- Filterable table ---------- */}
      <Card className="glass border border-[var(--glass-border)] p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="ابحث بالاسم أو اسم المستخدم…" className="glass-input pr-10" />
          </div>
          <div className="w-40">
            <Label className="text-[11px]">اللعبة</Label>
            <Select value={gameType} onValueChange={(v) => { setGameType(v); setPage(1); }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="addition_subtraction">جمع/طرح</SelectItem>
                <SelectItem value="multiplication">ضرب</SelectItem>
                <SelectItem value="division">قسمة</SelectItem>
                <SelectItem value="abacus">أباكوس</SelectItem>
                <SelectItem value="ai_match">AI</SelectItem>
                <SelectItem value="math_exam_generator">مولّد الامتحانات</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="glass border border-[var(--glass-border)] p-0">
        <div className="max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--glass-border)] hover:bg-transparent">
                <TableHead className="text-xs">الطالب</TableHead>
                <TableHead className="text-xs hidden sm:table-cell">اللعبة</TableHead>
                <TableHead className="text-xs">النتيجة</TableHead>
                <TableHead className="text-xs hidden md:table-cell">التاريخ</TableHead>
                <TableHead className="text-xs text-left">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell>
                </TableRow>
              ) : tableData && tableData.items.length > 0 ? (
                tableData.items.map((t) => (
                  <TableRow key={t.id} className="border-[var(--glass-border)] hover:bg-accent/5">
                    <TableCell>
                      <button className="text-sm font-semibold hover:underline" onClick={() => setView("admin-stats", { user_id: t.userId })}>
                        {t.studentName}
                      </button>
                      <div className="text-[11px] text-muted-foreground">@{t.username}</div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell"><Badge variant="outline" className="text-[10px]">{t.gameLabel}</Badge></TableCell>
                    <TableCell className="font-mono text-sm">{t.correctCount}/{t.questionCount}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{formatDistanceToNow(new Date(t.createdAt), { addSuffix: true, locale: ar })}</TableCell>
                    <TableCell className="text-left">
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" title="تفاصيل" onClick={() => setDetailsItem(t)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" title="حذف" onClick={() => {
                          if (confirm("حذف هذا التدريب؟")) deleteTrainingMut.mutate(t.id);
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="تفاصيل الطالب" onClick={() => setView("admin-stats", { user_id: t.userId })}>
                          <UserIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">لا توجد بيانات</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {tableData && tableData.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 border-t border-[var(--glass-border)] p-3">
            <div className="text-xs text-muted-foreground">
              صفحة <span className="num">{page}</span> من <span className="num">{tableData.pagination.totalPages}</span>
              {" "}— إجمالي <span className="num">{tableData.pagination.total}</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>السابق</Button>
              <Button size="sm" variant="outline" disabled={page >= tableData.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>التالي</Button>
            </div>
          </div>
        )}
      </Card>

      {/* ---------- Training details dialog ---------- */}
      <Dialog open={!!detailsItem} onOpenChange={(v) => !v && setDetailsItem(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              نتائج التدريب
            </DialogTitle>
            <DialogDescription>
              {detailsItem?.studentName} · {detailsItem?.gameLabel} · {detailsItem ? formatDistanceToNow(new Date(detailsItem.createdAt), { addSuffix: true, locale: ar }) : ""}
            </DialogDescription>
          </DialogHeader>
          {detailsItem && <ResultsView item={detailsItem} />}
          <div className="flex justify-end">
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteTrainingMut.isPending}
              onClick={() => deleteTrainingMut.mutate(detailsItem.id)}
            >
              <Trash2 className="h-4 w-4" />حذف التدريب
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}

// --------------------------------------------------------------------
function OverviewCard({
  icon: Icon,
  label,
  value,
  tone,
  isText,
}: {
  icon: typeof Brain;
  label: string;
  value: number | string;
  tone: "primary" | "success" | "warning" | "info";
  isText?: boolean;
}) {
  const tones: Record<string, string> = {
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    info: "text-info",
  };
  return (
    <Card className="glass border border-[var(--glass-border)] p-4">
      <Icon className={`mb-2 h-5 w-5 ${tones[tone]}`} />
      <div className={`${isText ? "text-base sm:text-lg" : "font-mono text-2xl"} font-bold truncate`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}

// --------------------------------------------------------------------
function ResultsView({ item }: { item: TableItem }) {
  const results = safeParse(item.resultsJson);
  if (results.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">لا توجد نتائج مفصّلة</p>;
  }
  return (
    <div className="max-h-[50vh] overflow-y-auto rounded-md border border-[var(--glass-border)]">
      <Table>
        <TableHeader>
          <TableRow className="border-[var(--glass-border)] hover:bg-transparent">
            <TableHead className="text-[11px]">#</TableHead>
            <TableHead className="text-[11px]">السؤال</TableHead>
            <TableHead className="text-[11px]">إجابتك</TableHead>
            <TableHead className="text-[11px]">الصحيحة</TableHead>
            <TableHead className="text-[11px] text-left">حالة</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((r, i) => (
            <TableRow key={i} className="border-[var(--glass-border)]">
              <TableCell className="text-xs text-muted-foreground num">{i + 1}</TableCell>
              <TableCell className="font-mono text-sm" dir="ltr">{r.question ?? "—"}</TableCell>
              <TableCell className="font-mono text-sm" dir="ltr">{String(r.userAnswer ?? "—")}</TableCell>
              <TableCell className="font-mono text-sm text-success" dir="ltr">{String(r.correctAnswer ?? "—")}</TableCell>
              <TableCell className="text-left">
                {r.isCorrect ? (
                  <Check className="h-4 w-4 text-success" />
                ) : (
                  <span className="text-destructive">✗</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
