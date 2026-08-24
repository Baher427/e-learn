"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "@/lib/ui-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain, ArrowRight, ArrowLeft, CheckCircle2, Mail, User, Phone, Lock, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface Trainer { id: string; name: string }

export function RegisterView() {
  const setView = useUIStore((s) => s.setView);
  const qc = useQueryClient();
  const { data: trainers = [] } = useQuery<Trainer[]>({
    queryKey: ["trainers"],
    queryFn: async () => {
      const res = await fetch("/api/trainers");
      const j = await res.json();
      return j.data?.trainers ?? [];
    },
  });

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);

  const [form, setForm] = useState({
    username: "",
    email: "",
    phone: "",
    trainerId: "",
    studentName: "",
    level: 1,
    password: "",
  });

  const update = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const checkUsername = async () => {
    if (!form.username || form.username.length < 4) return;
    setUsernameAvailable(null);
    const res = await fetch("/api/auth/check-username", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: form.username }),
    });
    const j = await res.json();
    setUsernameAvailable(j.status === "success");
  };

  const sendOtp = async () => {
    if (!form.email) { toast.error("الرجاء إدخال البريد الإلكتروني"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, purpose: "register" }),
      });
      const j = await res.json();
      if (j.status === "success") { setOtpSent(true); toast.success(`تم إرسال الرمز إلى ${j.data.maskedEmail}`); }
      else toast.error(j.message ?? "فشل الإرسال");
    } catch { toast.error("خطأ في الاتصال"); }
    finally { setLoading(false); }
  };

  const next = () => {
    if (step === 0) {
      if (!form.username || !form.email || !form.phone) { toast.error("الرجاء إكمال الحقول"); return; }
      if (!otpSent || otpCode.length < 6) { toast.error("الرجاء طلب رمز التحقق وإدخاله (6 أرقام)"); return; }
    }
    if (step === 1 && !form.trainerId) { toast.error("الرجاء اختيار مدرّب"); return; }
    if (step === 2 && (!form.studentName || !form.level)) { toast.error("الرجاء إدخال الاسم والمستوى"); return; }
    if (step === 3 && form.password.length < 6) { toast.error("كلمة المرور 6 أحرف على الأقل"); return; }
    setStep((s) => Math.min(s + 1, 3));
  };

  const prev = () => setStep((s) => Math.max(0, s - 1));

  const submit = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, otpCode }),
      });
      const j = await res.json();
      if (j.status === "success") {
        toast.success(j.data.message);
        // The server just set the session cookie via Set-Cookie header.
        // Force a refetch of /api/auth/me so the auth context picks up
        // the new (pending) user before we navigate — otherwise the
        // dashboard guard would still see `user === null` and bounce
        // back to the landing view.
        await qc.refetchQueries({ queryKey: ["auth", "me"] });
        // Go straight to the dashboard. Pending users see a clear
        // "حسابك قيد المراجعة" card there (dashboard-view lines 29-40).
        setView("dashboard");
      } else {
        toast.error(j.message ?? "فشل التسجيل");
      }
    } catch { toast.error("خطأ في الاتصال"); }
    finally { setLoading(false); }
  };

  const steps = [
    { icon: Mail, label: "الحساب" },
    { icon: User, label: "المدرّب" },
    { icon: CheckCircle2, label: "الهوية" },
    { icon: Lock, label: "الأمان" },
  ];

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="mb-6 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl gradient-primary shadow-lg">
            <Brain className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold">حساب جديد</h1>
          <p className="mt-1 text-sm text-muted-foreground">4 خطوات سريعة للانضمام إلى مجتمع العباقرة</p>
        </div>
        <div className="mb-6 flex items-center justify-between">
          {steps.map((s, i) => (
            <div key={i} className="flex flex-1 items-center">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${i <= step ? "border-primary bg-primary text-primary-foreground" : "border-muted bg-transparent text-muted-foreground"}`}>
                {i < step ? <Check className="h-5 w-5" /> : <s.icon className="h-5 w-5" />}
              </div>
              {i < steps.length - 1 && <div className={`h-0.5 flex-1 ${i < step ? "bg-primary" : "bg-muted"}`} />}
            </div>
          ))}
        </div>
        <Card className="glass border border-[var(--glass-border)] p-6 sm:p-8">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div key="step0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="r-username">اسم المستخدم</Label>
                  <div className="flex gap-2">
                    <Input id="r-username" value={form.username} onChange={(e) => update("username", e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))} onBlur={checkUsername} className="glass-input" placeholder="user123" minLength={4} maxLength={20} />
                    {usernameAvailable !== null && (<div className="flex items-center">{usernameAvailable ? <Check className="h-5 w-5 text-success" /> : <X className="h-5 w-5 text-destructive" />}</div>)}
                  </div>
                  <p className="text-xs text-muted-foreground">حروف إنجليزية صغيرة وأرقام، 4 أحرف على الأقل</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="r-email">البريد الإلكتروني</Label>
                  <Input id="r-email" type="email" value={form.email} onChange={(e) => { update("email", e.target.value); setOtpSent(false); }} className="glass-input" placeholder="you@example.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="r-phone">رقم الهاتف</Label>
                  <Input id="r-phone" value={form.phone} onChange={(e) => update("phone", e.target.value.replace(/\D/g, "").slice(0, 11))} className="glass-input font-mono" placeholder="01XXXXXXXXX" dir="ltr" />
                </div>
                <div className="space-y-2 rounded-xl border border-[var(--glass-border)] bg-[var(--input)] p-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="r-otp">رمز التحقق</Label>
                    <Button type="button" size="sm" variant="outline" onClick={sendOtp} disabled={loading || !form.email}>{otpSent ? "إعادة الإرسال" : "إرسال الرمز"}</Button>
                  </div>
                  <InputOTP value={otpCode} onChange={(v) => setOtpCode(v)} maxLength={6}>
                    <InputOTPGroup dir="ltr">
                      <InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} />
                      <InputOTPSlot index={3} /><InputOTPSlot index={4} /><InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                  {otpSent && <p className="text-xs text-success">تم إرسال رمز 6 أرقام إلى بريدك. تحقق من صندوق الوارد.</p>}
                </div>
              </motion.div>
            )}
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <Label>اختر مدرّبك</Label>
                <Select value={form.trainerId} onValueChange={(v) => update("trainerId", v)}>
                  <SelectTrigger className="glass-input"><SelectValue placeholder="اختر مدرّباً" /></SelectTrigger>
                  <SelectContent>
                    {trainers.map((t) => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}
                  </SelectContent>
                </Select>
                {trainers.length === 0 && <p className="text-xs text-muted-foreground">لا يوجد مدرّبون بعد. تواصل مع الإدارة.</p>}
              </motion.div>
            )}
            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="r-name">الاسم الكامل للطالب</Label>
                  <Input id="r-name" value={form.studentName} onChange={(e) => update("studentName", e.target.value)} className="glass-input" placeholder="محمد أحمد علي" minLength={3} />
                </div>
                <div className="space-y-2">
                  <Label>المستوى (1-10)</Label>
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((lvl) => (
                      <button key={lvl} type="button" onClick={() => update("level", lvl)} className={`h-10 w-10 rounded-lg font-mono font-bold transition ${form.level === lvl ? "gradient-primary text-white" : "glass text-muted-foreground hover:text-foreground"}`}>{lvl}</button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
            {step === 3 && (
              <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="r-pass">كلمة المرور</Label>
                  <Input id="r-pass" type="password" value={form.password} onChange={(e) => update("password", e.target.value)} className="glass-input" placeholder="••••••••" minLength={6} />
                </div>
                <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--input)] p-3 text-xs text-muted-foreground">
                  <p className="mb-1 font-bold">قوة كلمة المرور:</p>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full transition-all" style={{ width: `${Math.min(100, form.password.length * 12)}%`, background: form.password.length < 6 ? "var(--destructive)" : form.password.length < 10 ? "var(--warning)" : "var(--success)" }} />
                  </div>
                  <p className="mt-1">6 أحرف على الأقل. استخدم رموزاً وأرقاماً لقوة أعلى.</p>
                </div>
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
                  <p className="font-bold text-primary">ملاحظة:</p>
                  <p className="mt-1 text-muted-foreground">سيتم إنشاء حسابك بحالة «قيد الانتظار». سيتم تفعيله بعد موافقة الإدارة (خلال 24 ساعة عادةً).</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="mt-6 flex items-center justify-between gap-3">
            {step > 0 ? (<Button variant="ghost" onClick={prev} disabled={loading}><ArrowRight className="h-4 w-4" />السابق</Button>) : (<Button variant="ghost" onClick={() => setView("landing")}><ArrowRight className="h-4 w-4" />الرئيسية</Button>)}
            {step < 3 ? (<Button onClick={next} className="gradient-primary text-white">التالي<ArrowLeft className="h-4 w-4" /></Button>) : (<Button onClick={submit} disabled={loading} className="gradient-primary text-white">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}إنشاء الحساب</Button>)}
          </div>
        </Card>
        <div className="mt-4 text-center text-sm">
          <span className="text-muted-foreground">لديك حساب؟ </span>
          <button onClick={() => setView("login")} className="font-bold text-primary hover:underline">سجّل الدخول</button>
        </div>
      </motion.div>
    </div>
  );
}
