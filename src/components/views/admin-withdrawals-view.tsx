"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Wallet,
  Check,
  X,
  Copy,
  Save,
  Loader2,
  Coins,
  Banknote,
  PauseCircle,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface WithdrawalRequest {
  id: string;
  userId: string;
  studentName: string;
  username: string;
  userBalance: number;
  pointsAmount: number;
  moneyAmount: number;
  paymentMethod: string;
  accountDetails: string;
  status: "pending" | "approved" | "rejected";
  decidedAt: string | null;
  createdAt: string;
}

interface Settings {
  exchangeRate: number;
  minWithdrawal: number;
  systemStatus: string;
}

interface WithdrawalsResponse {
  stats: { pending: number; totalPaid: number };
  settings: Settings;
  requests: WithdrawalRequest[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const METHOD_LABELS: Record<string, string> = {
  vodafone_cash: "فودافون كاش",
  orange_cash: "أورانج كاش",
  instapay: "إنستا باي",
  etisalat_cash: "اتصالات كاش",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "قيد الانتظار", color: "bg-warning/15 text-warning border-warning/30" },
  approved: { label: "موافق", color: "bg-success/15 text-success border-success/30" },
  rejected: { label: "مرفوض", color: "bg-destructive/15 text-destructive border-destructive/30" },
};

export function AdminWithdrawalsView() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<WithdrawalsResponse>({
    queryKey: ["admin", "withdrawals", page],
    queryFn: async () => {
      const url = new URL("/api/admin/withdrawals", window.location.origin);
      url.searchParams.set("page", String(page));
      const res = await fetch(url, { credentials: "same-origin" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "fetch error");
      return j.data;
    },
  });

  const processMut = useMutation({
    mutationFn: async (payload: { requestId: string; decision: "approve" | "reject" }) => {
      const res = await fetch("/api/admin/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "process_request", ...payload }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "process failed");
      return j.data;
    },
    onSuccess: (d: Record<string, unknown>, vars) => {
      if (vars.decision === "reject" && typeof d.refunded === "number") {
        toast.success(`تم رفض الطلب وإرجاع ${d.refunded} نقطة للطالب`);
      } else {
        toast.success("تمت الموافقة على الطلب");
      }
      qc.invalidateQueries({ queryKey: ["admin", "withdrawals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AdminShell activeKey="withdrawals" title="طلبات السحب" subtitle="معالجة طلبات تحويل النقاط إلى أموال وضبط التسعير">
      {/* ---------- Stats ---------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCell icon={Coins} label="بانتظار المعالجة" value={data?.stats.pending ?? 0} tone="warning" />
        <StatCell icon={Banknote} label="إجمالي المدفوع" value={data?.stats.totalPaid ?? 0} tone="success" suffix="ج.م" />
        <StatCell icon={PauseCircle} label="حالة النظام" value={data?.settings.systemStatus === "1" ? "مفتوح" : "مغلق"} tone={data?.settings.systemStatus === "1" ? "primary" : "destructive"} isText />
      </div>

      {/* ---------- Pricing form ---------- */}
      {data && <PricingForm settings={data.settings} />}

      {/* ---------- Requests table ---------- */}
      <Card className="glass border border-[var(--glass-border)] p-0">
        <div className="max-h-[70vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--glass-border)] hover:bg-transparent">
                <TableHead>الطالب</TableHead>
                <TableHead className="hidden md:table-cell">النقاط</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead className="hidden sm:table-cell">طريقة الدفع</TableHead>
                <TableHead className="hidden lg:table-cell">تفاصيل الحساب</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-left">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : data && data.requests.length > 0 ? (
                data.requests.map((r) => {
                  const st = STATUS_LABELS[r.status] ?? STATUS_LABELS.pending;
                  return (
                    <TableRow key={r.id} className="border-[var(--glass-border)]">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className="gradient-primary text-white text-xs">{r.studentName.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{r.studentName}</div>
                            <div className="text-[11px] text-muted-foreground">@{r.username}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-sm">{r.pointsAmount}</TableCell>
                      <TableCell className="font-mono text-sm">{r.moneyAmount.toFixed(2)} ج.م</TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">{METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex items-center gap-1.5 text-xs">
                          <code className="max-w-[160px] truncate rounded bg-input/40 px-1.5 py-1" dir="ltr">{r.accountDetails}</code>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(r.accountDetails); toast.success("تم النسخ"); }}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className={st.color}>{st.label}</Badge></TableCell>
                      <TableCell className="text-left">
                        {r.status === "pending" ? (
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="text-success hover:text-success" disabled={processMut.isPending} onClick={() => processMut.mutate({ requestId: r.id, decision: "approve" })}>
                              <Check className="h-4 w-4" />قبول
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={processMut.isPending} onClick={() => {
                              if (confirm("رفض الطلب؟ سيتم إرجاع النقاط للطالب.")) {
                                processMut.mutate({ requestId: r.id, decision: "reject" });
                              }
                            }}>
                              <X className="h-4 w-4" />رفض
                            </Button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">{r.decidedAt ? formatDistanceToNow(new Date(r.decidedAt), { addSuffix: true, locale: ar }) : "—"}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    لا توجد طلبات
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 border-t border-[var(--glass-border)] p-3">
            <div className="text-xs text-muted-foreground">
              صفحة <span className="num">{page}</span> من <span className="num">{data.pagination.totalPages}</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>السابق</Button>
              <Button size="sm" variant="outline" disabled={page >= data.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>التالي</Button>
            </div>
          </div>
        )}
      </Card>
    </AdminShell>
  );
}

// --------------------------------------------------------------------
function StatCell({
  icon: Icon,
  label,
  value,
  tone,
  suffix,
  isText,
}: {
  icon: typeof Wallet;
  label: string;
  value: number | string;
  tone: "primary" | "warning" | "success" | "destructive";
  suffix?: string;
  isText?: boolean;
}) {
  const tones: Record<string, string> = {
    primary: "text-primary",
    warning: "text-warning",
    success: "text-success",
    destructive: "text-destructive",
  };
  return (
    <Card className="glass border border-[var(--glass-border)] p-4">
      <Icon className={`mb-2 h-5 w-5 ${tones[tone]}`} />
      <div className={`${isText ? "text-base" : "font-mono text-2xl"} font-bold`}>{value}</div>
      {suffix && <span className="text-xs text-muted-foreground mr-1">{suffix}</span>}
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}

// --------------------------------------------------------------------
function PricingForm({ settings }: { settings: Settings }) {
  const qc = useQueryClient();
  const [rate, setRate] = useState(String(settings.exchangeRate));
  const [min, setMin] = useState(String(settings.minWithdrawal));
  const [open, setOpen] = useState(settings.systemStatus === "1");

  // "Adjust state during render" pattern (per React docs) — sync local
  // state when the parent's settings prop changes after a save refetch.
  const [prevSettings, setPrevSettings] = useState(settings);
  if (
    prevSettings.exchangeRate !== settings.exchangeRate ||
    prevSettings.minWithdrawal !== settings.minWithdrawal ||
    prevSettings.systemStatus !== settings.systemStatus
  ) {
    setPrevSettings(settings);
    setRate(String(settings.exchangeRate));
    setMin(String(settings.minWithdrawal));
    setOpen(settings.systemStatus === "1");
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "update_settings",
          exchangeRate: parseFloat(rate),
          minWithdrawal: parseInt(min, 10),
          systemStatus: open ? "1" : "0",
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "save failed");
      return j.data;
    },
    onSuccess: () => {
      toast.success("تم تحديث الإعدادات");
      qc.invalidateQueries({ queryKey: ["admin", "withdrawals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rateNum = parseFloat(rate) || 0;
  const exampleEgp = (1000 * rateNum).toFixed(2);

  return (
    <Card className="glass border border-[var(--glass-border)] p-4 sm:p-5">
      <h3 className="mb-3 flex items-center gap-2 font-bold"><Coins className="h-4 w-4 text-primary" />تسعير النقاط</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label>سعر الصرف (ج.م لكل نقطة)</Label>
          <Input type="number" step="0.001" value={rate} onChange={(e) => setRate(e.target.value)} className="glass-input" dir="ltr" />
          <p className="mt-1 text-[11px] text-muted-foreground">1000 نقطة = <span className="num">{exampleEgp}</span> ج.م</p>
        </div>
        <div>
          <Label>الحد الأدنى للسحب (نقطة)</Label>
          <Input type="number" value={min} onChange={(e) => setMin(e.target.value)} className="glass-input" dir="ltr" />
        </div>
        <div>
          <Label>حالة نظام السحب</Label>
          <div className="flex h-9 items-center gap-2 rounded-md border border-[var(--glass-border)] bg-input/30 px-3">
            <Switch checked={open} onCheckedChange={setOpen} />
            <span className="text-sm">{open ? "مفتوح" : "مغلق"}</span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button className="gradient-primary text-white" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
          {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          حفظ الإعدادات
        </Button>
      </div>
    </Card>
  );
}
