"use client";

import { motion } from "framer-motion";
import { useUIStore } from "@/lib/ui-store";
import { useAuth } from "@/components/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Trophy, TrendingUp, Bot, Calculator, Users, Zap, ShieldCheck, Sparkles } from "lucide-react";

const FEATURES = [
  { icon: Trophy, title: "منافسات وتحديات حية", desc: "شارك في أقوى المسابقات الحية وتحدّى أصدقاءك لرفع مستوى التركيز.", color: "text-primary" },
  { icon: TrendingUp, title: "مناهج متطورة", desc: "نظام تدريب عقلي شامل لتنمية الذاكرة والإبداع وفق أحدث المعايير.", color: "text-accent" },
  { icon: Bot, title: "تحدي الروبوت الذكي", desc: "واجه الذكاء الاصطناعي في اختبارات رياضية متدرجة الصعوبة.", color: "text-success" },
  { icon: ShieldCheck, title: "بياناتك في أمان", desc: "بنية أمنية حديثة: تشفير bcrypt، جلسات JWT، وخصوصية كاملة لطفلك.", color: "text-warning" },
  { icon: Calculator, title: "أربعة أنواع تدريب", desc: "جمع وطرح، ضرب، قسمة، وأباكوس سوروبان — كلٌّ بمستويات صعوبة.", color: "text-info" },
  { icon: Users, title: "مجتمع وتعلّم جماعي", desc: "لوحة متصدّرين، صداقات، وتدريبات جماعية تحفّز طفلك على التميّز.", color: "text-destructive" },
];

const STATS = [
  { label: "تدريبات يومية", value: "+10K" },
  { label: "طلاب نشطون", value: "+500" },
  { label: "دقة التقييم", value: "98%" },
  { label: "متوسط التحسّن", value: "+35%" },
];

export function LandingView() {
  const setView = useUIStore((s) => s.setView);
  const { user } = useAuth();

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="flex flex-col items-center text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>منصة تعليمية ذكية — نسخة 2027</span>
        </div>
        <div className="relative mb-6">
          <div className="absolute -inset-8 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl gradient-primary shadow-2xl">
            <span className="text-5xl">🧠</span>
          </div>
        </div>
        <h1 className="mb-4 text-4xl font-extrabold tracking-tight sm:text-6xl">
          منصة <span className="gradient-text">e-learn</span>
          <br />
          <span className="mt-2 block text-lg font-medium text-muted-foreground sm:text-2xl">للحساب الذهني وتطوير القدرات العقلية</span>
        </h1>
        <p className="mb-8 max-w-2xl text-base text-muted-foreground sm:text-lg">
          منصة تعليمية متكاملة تدمج بين المتعة والتعلم. نستخدم أحدث تقنيات الحساب الذهني والذكاء الاصطناعي لرفع مستوى التركيز وتعزيز الصحة العقلية لطفلك.
        </p>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          {user ? (
            <Button size="lg" className="gradient-primary text-white shadow-lg hover:shadow-primary/50" onClick={() => setView(user.role === "admin" ? "admin-users" : "dashboard")}>
              <Zap className="h-4 w-4" />
              ابدأ التحدّي الآن
            </Button>
          ) : (
            <>
              <Button size="lg" className="gradient-primary text-white shadow-lg hover:shadow-primary/50" onClick={() => setView("login")}>
                <Zap className="h-4 w-4" />
                تسجيل الدخول
              </Button>
              <Button size="lg" variant="outline" className="glass border border-[var(--glass-border)]" onClick={() => setView("register")}>
                <Sparkles className="h-4 w-4" />
                حساب جديد
              </Button>
            </>
          )}
        </div>
      </motion.section>

      <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }} className="mt-12 grid grid-cols-2 gap-3 sm:mt-16 sm:grid-cols-4 sm:gap-4">
        {STATS.map((s) => (
          <Card key={s.label} className="glass border border-[var(--glass-border)] p-4 text-center">
            <div className="font-mono text-2xl font-bold gradient-text sm:text-3xl">{s.value}</div>
            <div className="mt-1 text-xs text-muted-foreground sm:text-sm">{s.label}</div>
          </Card>
        ))}
      </motion.section>

      <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="mt-16 sm:mt-24">
        <h2 className="mb-8 text-center text-2xl font-bold sm:text-3xl">لماذا <span className="gradient-text">e-learn</span>؟</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.1 }}>
              <Card className="glass h-full border border-[var(--glass-border)] p-6 transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10">
                <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl glass ${f.color}`}>
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 font-bold">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {!user && (
        <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="mt-16 sm:mt-24">
          <Card className="glass-strong relative overflow-hidden border border-[var(--glass-border)] p-8 text-center sm:p-12">
            <div className="absolute inset-0 -z-10 gradient-primary opacity-5" />
            <h2 className="mb-3 text-2xl font-bold sm:text-3xl">جاهز لصناعة عبقري؟</h2>
            <p className="mx-auto mb-6 max-w-xl text-muted-foreground">انضم اليوم واحصل على شهر تجريبي مجاني. تدريبات لا محدودة، تحديات حية، وتقارير أداء تفصيلية لطفلك.</p>
            <Button size="lg" className="gradient-primary text-white" onClick={() => setView("register")}>
              <Sparkles className="h-4 w-4" />
              ابدأ مجاناً الآن
            </Button>
          </Card>
        </motion.section>
      )}
    </div>
  );
}
