"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/auth-context";
import { useUIStore } from "@/lib/ui-store";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { toast } from "sonner";

/**
 * بوابة العباقرة — login view rebuilt to match the legacy login.php design,
 * plus the previously missing "تأمين الحساب" flow (device conflict → email
 * OTP → force-logout of the other device).
 *
 * Why a direct fetch() instead of useAuth().login()? The auth-context login
 * throws on any non-2xx response and swallows the `code: "device_conflict"`
 * field this view needs in order to open the security modal. After a
 * successful login we await refresh() (invalidates ["auth","me"]) BEFORE
 * setView("dashboard") so the dashboard guard already sees the fresh session
 * cookie — same fix the register view received in Task 14.
 */
export function LoginView() {
  const { refresh } = useAuth();
  const setView = useUIStore((s) => s.setView);

  // ---- login form state ----
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- "تأمين الحساب" modal state (device conflict → OTP → force logout) ----
  const [conflictOpen, setConflictOpen] = useState(false);
  const [otpStep, setOtpStep] = useState<"send" | "verify">("send");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpCode, setOtpCode] = useState("");

  const resetConflict = () => {
    setOtpStep("send");
    setOtpCode("");
  };

  const closeConflict = () => {
    setConflictOpen(false);
    resetConflict();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      const msg = "الرجاء إدخال اسم المستخدم وكلمة المرور";
      setError(msg);
      toast.error(msg);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.status === "success") {
        toast.success("تم تسجيل الدخول بنجاح");
        // Refetch the auth query BEFORE navigating so the dashboard guard
        // sees the new session cookie (fix from Task 14 / register view).
        await refresh();
        setView("dashboard");
      } else if (res.status === 409 && j.code === "device_conflict") {
        // Account is open on another device → open the security modal.
        resetConflict();
        setConflictOpen(true);
      } else {
        const msg = j.message ?? "بيانات الدخول غير صحيحة";
        setError(msg);
        toast.error(msg);
      }
    } catch {
      setError("خطأ في الاتصال");
      toast.error("خطأ في الاتصال");
    } finally {
      setLoading(false);
    }
  };

  /** Step 1 — send the force-logout OTP to the account's email. */
  const sendOtp = async () => {
    if (!username.trim()) {
      toast.error("اسم المستخدم مفقود");
      return;
    }
    setOtpSending(true);
    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username: username.trim(), purpose: "login_force" }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.status === "success") {
        const masked = j.data?.maskedEmail ?? "";
        toast.success(
          masked ? `تم إرسال الكود إلى: ${masked}` : "تم إرسال كود التحقق إلى بريدك الإلكتروني"
        );
        setOtpCode("");
        setOtpStep("verify");
      } else {
        toast.error(j.message ?? "فشل الإرسال");
      }
    } catch {
      toast.error("خطأ في الاتصال");
    } finally {
      setOtpSending(false);
    }
  };

  /** Step 2 — re-submit login with forceLogout + OTP to kick the other device. */
  const verifyOtp = async () => {
    if (otpCode.length < 6) {
      toast.error("الرجاء إدخال الكود كاملاً (6 أرقام)");
      return;
    }
    setOtpVerifying(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          username: username.trim(),
          password,
          forceLogout: true,
          otpCode,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.status === "success") {
        toast.success("تم تسجيل الدخول بنجاح");
        await refresh();
        closeConflict();
        setView("dashboard");
      } else {
        // Wrong / expired code → keep the modal open and allow retry.
        toast.error(j.message ?? "رمز التحقق خاطئ أو منتهي الصلاحية!");
      }
    } catch {
      toast.error("خطأ في الاتصال");
    } finally {
      setOtpVerifying(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md items-center px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full"
      >
        {/* Header — legacy login.php */}
        <div className="mb-6 text-center">
          <div className="mb-4 inline-flex animate-pulse rounded-full border border-indigo-500/20 bg-indigo-500/10 p-4">
            <span className="text-4xl" role="img" aria-label="مخ">🧠</span>
          </div>
          <h1 className="mb-2 text-3xl font-bold">بوابة العباقرة</h1>
          <p className="text-sm text-muted-foreground">سجل دخولك واستعد للتحدي!</p>
        </div>

        <div className="glass w-full rounded-2xl border border-[var(--glass-border)] p-6 sm:p-8">
          {error && (
            <div
              role="alert"
              className="mb-6 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
            >
              <span aria-hidden="true">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="mb-2 block text-sm font-bold">
                اسم المستخدم
              </label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="glass-input h-12 rounded-xl px-4 py-3 text-sm"
                placeholder="username"
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-bold">
                كلمة المرور
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="glass-input h-12 rounded-xl px-4 py-3 pl-11 text-sm"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition hover:text-foreground"
                  aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="gradient-primary mt-2 w-full rounded-xl py-3.5 text-sm font-bold text-white shadow-lg transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-60"
            >
              {loading ? <span className="animate-pulse">جارٍ الدخول…</span> : "🚀 انطلق للساحة"}
            </button>
          </form>

          <div className="mt-6 border-t border-[var(--glass-border)] pt-6 text-center">
            <p className="text-xs text-muted-foreground">
              ليس لديك حساب؟{" "}
              <button
                type="button"
                onClick={() => setView("register")}
                className="font-bold text-primary hover:underline"
              >
                أنشئ حساباً جديداً
              </button>
            </p>
          </div>
        </div>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setView("landing")}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
          >
            <ArrowRight className="h-3 w-3" />
            العودة للرئيسية
          </button>
        </div>
      </motion.div>

      {/* تأمين الحساب — device conflict / force-logout OTP modal (legacy login.php) */}
      <Dialog
        open={conflictOpen}
        onOpenChange={(open) => {
          if (open) setConflictOpen(true);
          else closeConflict();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="relative gap-0 overflow-hidden rounded-3xl border-[var(--glass-border)] p-8 text-center sm:max-w-sm"
        >
          {/* decorative blur circle (legacy) */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-blue-500/10 blur-2xl"
          />
          <div aria-hidden="true" className="mb-4 text-5xl">
            📧🔒
          </div>
          <DialogTitle className="mb-2 text-xl leading-normal font-bold text-indigo-400">
            تأمين الحساب
          </DialogTitle>

          {otpStep === "send" ? (
            <>
              <DialogDescription className="mb-6 text-sm leading-relaxed text-muted-foreground">
                الحساب مفتوح من جهاز آخر. للأمان، أرسل كود التحقق إلى بريدك الإلكتروني.
              </DialogDescription>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={sendOtp}
                  disabled={otpSending}
                  className="w-full rounded-xl bg-gradient-to-l from-blue-600 to-blue-500 py-3 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-60"
                >
                  {otpSending ? (
                    <span className="animate-pulse">جارٍ الإرسال…</span>
                  ) : (
                    "📩 إرسال الكود للإيميل"
                  )}
                </button>
                <button
                  type="button"
                  onClick={closeConflict}
                  className="w-full rounded-xl py-2.5 text-sm font-bold text-muted-foreground transition hover:bg-muted/10 hover:text-foreground"
                >
                  إلغاء
                </button>
              </div>
            </>
          ) : (
            <>
              <DialogDescription className="mb-4 text-sm leading-relaxed text-muted-foreground">
                تم الإرسال. أدخل الكود هنا:
              </DialogDescription>
              <div dir="ltr" className="mb-4 flex justify-center">
                <InputOTP
                  value={otpCode}
                  onChange={setOtpCode}
                  maxLength={6}
                  disabled={otpVerifying}
                  autoFocus
                >
                  <InputOTPGroup dir="ltr">
                    <InputOTPSlot index={0} className="h-12 w-10 text-xl font-bold" />
                    <InputOTPSlot index={1} className="h-12 w-10 text-xl font-bold" />
                    <InputOTPSlot index={2} className="h-12 w-10 text-xl font-bold" />
                    <InputOTPSlot index={3} className="h-12 w-10 text-xl font-bold" />
                    <InputOTPSlot index={4} className="h-12 w-10 text-xl font-bold" />
                    <InputOTPSlot index={5} className="h-12 w-10 text-xl font-bold" />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={verifyOtp}
                  disabled={otpVerifying}
                  className="gradient-primary w-full rounded-xl py-3 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-60"
                >
                  {otpVerifying ? (
                    <span className="animate-pulse">جارٍ التحقق…</span>
                  ) : (
                    "🔓 تأكيد ودخول"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOtpStep("send");
                    setOtpCode("");
                  }}
                  className="text-xs text-muted-foreground transition hover:text-foreground"
                >
                  لم يصل الكود؟ حاول مرة أخرى
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
