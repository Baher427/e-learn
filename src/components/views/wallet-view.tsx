"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "@/lib/ui-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight, Wallet as WalletIcon, Banknote, Send, Clock, Check, X, Lock } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

const METHODS = [
  { value: "vodafone_cash", label: "فودافون كاش" },
  { value: "orange_cash", label: "أورانج كاش" },
  { value: "instapay", label: "إنستاباي" },
  { value: "etisalat_cash", label: "اتصالات كاش" },
];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "قيد المراجعة", color: "text-warning" },
  approved: { label: "تم الاعتماد", color: "text-success" },
  rejected: { label: "مرفوض", color: "text-destructive" },
};

export function WalletView() {
  const setView = useUIStore((s) => s.setView);
  const qc = useQueryClient();
  const [points, setPoints] = useState("");
  const [method, setMethod] = useState("vodafone_cash");
  const [account, setAccount] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpModal, setOtpModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["wallet"],
    queryFn: async () => {
      const res = await fetch("/api/wallet", { credentials: "same-origin" });
      const j = await res.json();
      return j.data;
    },
  });

  const otpMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/wallet/otp", {
        method: "POST",
        credentials: "same-origin",
      });
      const j = await res.json();
      if (j.status !== "success") throw new Error(j.message);
      return j.data;
    },
    onSuccess: (d) => {
      setOtpModal(true);
      toast.success(`تم إرسال الرمز إلى ${d.maskedEmail}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const withdrawMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          points: parseInt(points),
          method,
          account,
          otpCode,
        }),
      });
      const j = await res.json();
      if (j.status !== "success") throw new Error(j.message);
      return j.data;
    },
    onSuccess: () => {
      toast.success("تم تسجيل طلبك بنجاح!");
      setPoints("");
      setAccount("");
      setOtpCode("");
      setOtpModal(false);
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!points || !account) {
      toast.error("الرجاء إكمال كل الحقول");
      return;
    }
    otpMut.mutate();
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="animate-pulse text-muted-foreground">جارٍ التحميل…</div>
      </div>
    );
  }

  const moneyValue = data
    ? (parseInt(points || "0") * data.exchangeRate).toFixed(2)
    : "0";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <button
        onClick={() => setView("dashboard")}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="h-4 w-4" />
        لوحة التحكم
      </button>

      <div className="mb-6 text-center">
        <WalletIcon className="mx-auto mb-2 h-12 w-12 text-accent" />
        <h1 className="text-2xl font-bold">محفظتي</h1>
        <p className="text-sm text-muted-foreground">حوّل نقاطك إلى أموال حقيقية</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Balance card */}
        <Card className="glass border border-[var(--glass-border)] p-5">
          <div className="text-sm text-muted-foreground">رصيدك الحالي</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold gradient-text">
              {data?.points ?? 0}
            </span>
            <span className="text-sm text-muted-foreground">نقطة PVP</span>
          </div>
          <div className="mt-4 rounded-lg glass p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">سعر الصرف:</span>
              <span className="font-mono">
                كل {Math.round(1 / (data?.exchangeRate ?? 0.02))} نقطة = 1 ج.م
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground">الحد الأدنى للسحب:</span>
              <span className="font-mono">{data?.minWithdrawal ?? 50} نقطة</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground">حالة النظام:</span>
              {data?.systemStatus ? (
                <Badge className="text-success" variant="secondary">مفتوح</Badge>
              ) : (
                <Badge className="text-destructive" variant="secondary">مغلق</Badge>
              )}
            </div>
          </div>
        </Card>

        {/* Withdrawal form */}
        <Card className={`glass border border-[var(--glass-border)] p-5 ${!data?.systemStatus ? "opacity-50 pointer-events-none" : ""}`}>
          <h2 className="mb-3 flex items-center gap-2 font-bold">
            <Banknote className="h-5 w-5 text-success" />
            طلب سحب جديد
          </h2>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="w-points">عدد النقاط</Label>
              <Input
                id="w-points"
                type="number"
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                className="glass-input font-mono"
                min={data?.minWithdrawal ?? 50}
                placeholder={String(data?.minWithdrawal ?? 50)}
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground">
                القيمة المتوقعة: <span className="font-mono text-success">{moneyValue} ج.م</span>
              </p>
            </div>
            <div className="space-y-1">
              <Label>طريقة الاستلام</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="glass-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="w-account">بيانات الحساب (رقم المحفظة)</Label>
              <Input
                id="w-account"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                className="glass-input font-mono"
                placeholder="01XXXXXXXXX"
                dir="ltr"
              />
            </div>
            <Button
              type="submit"
              disabled={otpMut.isPending || !data?.systemStatus}
              className="gradient-primary w-full text-white"
            >
              <Send className="h-4 w-4" />
              متابعة (إرسال رمز التأكيد)
            </Button>
          </form>
        </Card>
      </div>

      {/* History */}
      <Card className="glass mt-4 border border-[var(--glass-border)] p-5">
        <h2 className="mb-3 flex items-center gap-2 font-bold">
          <Clock className="h-5 w-5 text-info" />
          سجل طلبات السحب
        </h2>
        {data?.history.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            لا توجد طلبات سحب بعد
          </p>
        ) : (
          <div className="space-y-2">
            {data?.history.map((h: any) => {
              const st = STATUS_MAP[h.status] ?? STATUS_MAP.pending;
              return (
                <motion.div
                  key={h.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-between rounded-lg glass p-3"
                >
                  <div>
                    <div className="font-mono text-sm">
                      {h.pointsAmount} نقطة →{" "}
                      <span className="font-bold text-success">{h.moneyAmount} ج.م</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {METHODS.find((m) => m.value === h.paymentMethod)?.label} ·{" "}
                      {new Date(h.createdAt).toLocaleDateString("ar-EG")}
                    </div>
                  </div>
                  <Badge className={st.color} variant="secondary">
                    {st.label}
                  </Badge>
                </motion.div>
              );
            })}
          </div>
        )}
      </Card>

      {/* OTP Modal */}
      {otpModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="glass-strong w-full max-w-md border border-[var(--glass-border)] p-6 text-center">
            <Lock className="mx-auto mb-3 h-10 w-10 text-primary" />
            <h3 className="mb-2 text-lg font-bold">رمز التأكيد</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              أدخل الرمز المُرسل إلى بريدك الإلكتروني
            </p>
            <InputOTP
              value={otpCode}
              onChange={setOtpCode}
              maxLength={6}
              className="mb-4"
            >
              <InputOTPGroup dir="ltr">
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setOtpModal(false)}
              >
                إلغاء
              </Button>
              <Button
                disabled={otpCode.length < 6 || withdrawMut.isPending}
                className="gradient-primary flex-1 text-white"
                onClick={() => withdrawMut.mutate()}
              >
                {withdrawMut.isPending ? "جارٍ المعالجة…" : "تأكيد"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
