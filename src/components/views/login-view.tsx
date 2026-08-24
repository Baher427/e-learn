"use client";

/**
 * بوابة العباقرة — legacy-style login view.
 * Straightforward credentials login.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/auth-context";
import { useUIStore } from "@/lib/ui-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Zap, ArrowRight, Brain } from "lucide-react";
import { toast } from "sonner";

export function LoginView() {
  const { login } = useAuth();
  const setView = useUIStore((s) => s.setView);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error("الرجاء إدخال اسم المستخدم وكلمة المرور");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await login(username, password);
      toast.success("تم تسجيل الدخول بنجاح");
      setView("dashboard");
    } catch (err: any) {
      setError(err.message ?? "فشل تسجيل الدخول");
      toast.error(err.message ?? "فشل تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md items-center px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full">
        <div className="mb-6 text-center">
          <div className="mb-4 inline-flex rounded-full border border-indigo-500/20 bg-indigo-500/10 p-4 animate-pulse">
            <span className="text-4xl">🧠</span>
          </div>
          <h1 className="text-3xl font-bold">بوابة العباقرة</h1>
          <p className="mt-1 text-sm text-muted-foreground">سجل دخولك واستعد للتحدي!</p>
        </div>
        <Card className="glass border border-[var(--glass-border)] rounded-2xl p-6 sm:p-8">
          {error && (
            <div className="mb-5 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              <span>⚠️</span> {error}
            </div>
          )}
          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <Label htmlFor="username" className="mb-2 block text-sm font-bold">اسم المستخدم</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} className="glass-input h-12 rounded-xl px-4" placeholder="username" autoComplete="username" required />
            </div>
            <div>
              <Label htmlFor="password" className="mb-2 block text-sm font-bold">كلمة المرور</Label>
              <div className="relative">
                <Input id="password" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="glass-input h-12 rounded-xl px-4" placeholder="••••••••" autoComplete="current-password" required />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute left-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={loading} className="gradient-primary w-full rounded-xl py-3.5 font-bold text-white shadow-lg transition hover:-translate-y-0.5">
              {loading ? <span className="animate-pulse">جارٍ الدخول…</span> : (<><Zap className="h-4 w-4" />انطلق للساحة</>)}
            </Button>
          </form>
          <div className="mt-6 border-t border-[var(--glass-border)] pt-4 text-center text-sm">
            <span className="text-muted-foreground">ليس لديك حساب؟ </span>
            <button onClick={() => setView("register")} className="font-bold text-primary hover:underline">أنشئ حساباً جديداً</button>
          </div>
          <div className="mt-3 text-center">
            <button onClick={() => setView("landing")} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowRight className="h-3 w-3" />
              العودة للرئيسية
            </button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
