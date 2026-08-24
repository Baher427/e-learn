"use client";

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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error("الرجاء إدخال اسم المستخدم وكلمة المرور");
      return;
    }
    setLoading(true);
    try {
      await login(username, password);
      toast.success("تم تسجيل الدخول بنجاح");
      setView("dashboard");
    } catch (err: any) {
      toast.error(err.message ?? "فشل تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md items-center px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full">
        <div className="mb-6 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl gradient-primary shadow-lg">
            <Brain className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold">بوابة العباقرة</h1>
          <p className="mt-1 text-sm text-muted-foreground">سجّل دخولك واستعد للتحدّي!</p>
        </div>
        <Card className="glass border border-[var(--glass-border)] p-6 sm:p-8">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">اسم المستخدم</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} className="glass-input" placeholder="username" autoComplete="username" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <div className="relative">
                <Input id="password" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="glass-input pl-10" placeholder="••••••••" autoComplete="current-password" required />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={loading} className="gradient-primary w-full text-white shadow-lg">
              {loading ? <span className="animate-pulse">جارٍ الدخول…</span> : (<><Zap className="h-4 w-4" />انطلق إلى الساحة</>)}
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
