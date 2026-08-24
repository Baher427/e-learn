"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Calculator,
  Clock,
  Divide,
  Dumbbell,
  FileSignature,
  LogOut,
  PieChart,
  Plus,
  TriangleAlert,
  Trophy,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth-context";
import { useUIStore, type ViewId } from "@/lib/ui-store";
import { useIsMounted } from "@/lib/hooks/use-is-mounted";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/* ------------------------------------------------------------------ */
/* Legacy dashboard.php cards — نفس الكروت بألوانها الأصلية            */
/* ------------------------------------------------------------------ */

interface TrainingCardDef {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  /** شريحة الأيقونة أعلى الكارت (يمين) + تفاعل hover */
  chip: string;
  /** لون الإطار عند الـ hover */
  hoverBorder: string;
  action: { view: ViewId; params?: Record<string, string> };
}

const TRAINING_CARDS: TrainingCardDef[] = [
  {
    title: "الجمع والطرح",
    subtitle: "أساسيات الحساب",
    icon: Plus,
    chip: "bg-blue-500/10 text-blue-500 group-hover:bg-blue-500 group-hover:text-white",
    hoverBorder: "hover:border-blue-500/50",
    action: { view: "trainings", params: { game: "add-sub" } },
  },
  {
    title: "لعبة الضرب",
    subtitle: "جدول الضرب",
    icon: X,
    chip: "bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white",
    hoverBorder: "hover:border-emerald-500/50",
    action: { view: "trainings", params: { game: "mult" } },
  },
  {
    title: "القسمة",
    subtitle: "تحدي القسمة",
    icon: Divide,
    chip: "bg-cyan-500/10 text-cyan-500 group-hover:bg-cyan-500 group-hover:text-white",
    hoverBorder: "hover:border-cyan-500/50",
    action: { view: "trainings", params: { game: "div" } },
  },
  {
    title: "عداد الأباكس",
    subtitle: "تخيل وتمثيل",
    icon: Calculator,
    chip: "bg-teal-500/10 text-teal-500 group-hover:bg-teal-500 group-hover:text-white",
    hoverBorder: "hover:border-teal-500/50",
    action: { view: "trainings", params: { game: "abacus" } },
  },
  {
    title: "إحصائياتي",
    subtitle: "تابع تقدمك",
    icon: PieChart,
    chip: "bg-orange-500/10 text-orange-500 group-hover:bg-orange-500 group-hover:text-white",
    hoverBorder: "hover:border-orange-500/50",
    action: { view: "statistics" },
  },
];

interface ChallengeCardDef {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  /** توهج ثابت (حدود + ظل) */
  glow: string;
  /** توهج الـ hover */
  hoverGlow: string;
  /** شريحة الأيقونة */
  chip: string;
  /** الدائرة الضوئية الخلفية */
  blur: string;
  /** دائرة السهم يمين الشاشة */
  circle: string;
  view: ViewId;
}

const CHALLENGE_CARDS: ChallengeCardDef[] = [
  {
    title: "ساحة المعركة",
    subtitle: "تحدى أصدقاءك والروبوت في مواجهات مباشرة!",
    icon: Trophy,
    glow: "border-orange-500/30 shadow-[0_0_20px_rgba(249,115,22,0.25)]",
    hoverGlow: "hover:border-orange-500/60 hover:shadow-[0_0_40px_rgba(249,115,22,0.5)]",
    chip: "bg-orange-500/20 text-orange-500",
    blur: "bg-orange-500/20 group-hover:bg-orange-500/30",
    circle: "text-orange-500 group-hover:bg-orange-500 group-hover:text-white",
    view: "pvp",
  },
  {
    title: "الاختبارات",
    subtitle: "قم بإنشاء اختبارات مخصصة لتقييم مستواك.",
    icon: FileSignature,
    glow: "border-purple-500/30 shadow-[0_0_20px_rgba(168,85,247,0.25)]",
    hoverGlow: "hover:border-purple-500/60 hover:shadow-[0_0_40px_rgba(168,85,247,0.5)]",
    chip: "bg-purple-500/20 text-purple-500",
    blur: "bg-purple-500/20 group-hover:bg-purple-500/30",
    circle: "text-purple-500 group-hover:bg-purple-500 group-hover:text-white",
    view: "exam-generator",
  },
];

/* ------------------------------------------------------------------ */
/* تنبيه قرب انتهاء الاشتراك — مرة واحدة لكل جلسة (كما في القديم)      */
/* ------------------------------------------------------------------ */

const EXPIRY_WARNING_KEY = "expiry_warning_shown";

function wasExpiryWarningShown(): boolean {
  try {
    return typeof window !== "undefined" && window.sessionStorage.getItem(EXPIRY_WARNING_KEY) === "1";
  } catch {
    return false;
  }
}

export function DashboardView() {
  const { user, logout, unreadNotifications } = useAuth();
  const setView = useUIStore((s) => s.setView);
  const mounted = useIsMounted();
  const [expiryDismissed, setExpiryDismissed] = useState(false);

  if (!user) return null;
  if (user.status === "pending") {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-md items-center px-4">
        <Card className="glass-strong border border-warning/30 p-8 text-center">
          <div className="mb-4 text-5xl">⏳</div>
          <h2 className="mb-2 text-xl font-bold">حسابك قيد المراجعة</h2>
          <p className="text-sm text-muted-foreground">تم إنشاء حسابك بنجاح. سيتم تفعيله بعد موافقة الإدارة (خلال 24 ساعة عادةً). سيتم إشعارك عبر البريد الإلكتروني.</p>
          <Button className="mt-6 gradient-primary text-white" onClick={() => logout()}><LogOut className="h-4 w-4" />تسجيل الخروج</Button>
        </Card>
      </div>
    );
  }
  if (user.status === "expired") {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-md items-center px-4">
        <Card className="glass-strong border border-destructive/30 p-8 text-center">
          <div className="mb-4 text-5xl">🚫</div>
          <h2 className="mb-2 text-xl font-bold">انتهت صلاحية حسابك</h2>
          <p className="text-sm text-muted-foreground">لقد انتهت مدة اشتراكك. يرجى التواصل مع الإدارة للتجديد.</p>
          <Button className="mt-6 gradient-primary text-white" onClick={() => logout()}><LogOut className="h-4 w-4" />تسجيل الخروج</Button>
        </Card>
      </div>
    );
  }

  // ----- حسابات الصلاحية (نفس منطق dashboard.php القديم) -----
  const msRemaining = user.validityEnd ? new Date(user.validityEnd).getTime() - Date.now() : null;
  const validityRemaining = msRemaining !== null ? Math.max(0, Math.ceil(msRemaining / 86_400_000)) : null;
  const hoursRemaining = msRemaining !== null ? msRemaining / 3_600_000 : null;
  const needsExpiryWarning = hoursRemaining !== null && hoursRemaining > 0 && hoursRemaining <= 24;
  // البوابة mounted تضمن ثبات الـ SSR/الـ hydration، وقراءة sessionStorage أثناء
  // الرندر هي قراءة نقية (لا setState داخل effect إطلاقاً).
  const showExpiryWarning =
    mounted && !expiryDismissed && needsExpiryWarning && !wasExpiryWarningShown();

  const dismissExpiryWarning = () => {
    setExpiryDismissed(true);
    try {
      window.sessionStorage.setItem(EXPIRY_WARNING_KEY, "1");
    } catch {
      /* التخزين غير متاح (وضع خاص) — علم الحالة يمنع إعادة الظهور */
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      {/* ===== 1) بانر الترحيب — hero القديم بتدرج indigo→violet ===== */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r from-indigo-600 to-violet-600 p-6 text-white shadow-2xl shadow-indigo-500/20 sm:p-10"
      >
        <div className="pointer-events-none absolute -mt-16 -mr-16 right-0 top-0 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -mb-10 -ml-10 bottom-0 left-0 h-40 w-40 rounded-full bg-black/10 blur-2xl" />

        <div className="relative z-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <h2 className="mb-2 text-2xl font-black sm:text-3xl">أهلاً يا بطل! 👋</h2>
            <p className="max-w-lg text-sm font-medium leading-relaxed text-indigo-100 sm:text-base">
              جاهز تكسر أرقامك القياسية النهاردة؟ ابدأ بالتدريبات وسخن عقلك قبل التحديات!
            </p>
          </div>
          <button
            type="button"
            onClick={() => setView("pvp")}
            className="glass flex cursor-pointer items-center gap-2 rounded-xl border-white/20 bg-white/20 px-5 py-2.5 text-sm font-bold text-white shadow-lg transition hover:bg-white/30"
          >
            <span>الساحة</span>
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </motion.div>

      {/* ===== تحسين: شريط إحصائيات مصغّر بين البانر ومنطقة التدريب ===== */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3"
      >
        <Badge variant="outline" className="glass gap-1.5 px-3 py-1.5 text-xs font-semibold">
          <Award className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span className="font-mono font-bold">{user.totalPoints}</span>
          نقاط التدريب
        </Badge>
        <Badge variant="outline" className="glass gap-1.5 px-3 py-1.5 text-xs font-semibold">
          <Trophy className="h-3.5 w-3.5 text-orange-500" aria-hidden />
          <span className="font-mono font-bold">{user.pvpPoints}</span>
          نقاط PVP
        </Badge>
        {validityRemaining !== null && (
          <Badge variant="outline" className="glass gap-1.5 px-3 py-1.5 text-xs font-semibold">
            <Clock className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
            <span className="font-mono font-bold">{validityRemaining}</span>
            أيام متبقية
          </Badge>
        )}
      </motion.div>

      {/* ===== 2) منطقة التدريب — 5 كروت بألوان القديم ===== */}
      <section className="mt-8">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-bold">
          <span className="rounded-lg bg-blue-500/20 p-1.5 text-sm text-blue-400">
            <Dumbbell className="h-4 w-4" aria-hidden />
          </span>
          منطقة التدريب
        </h3>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
          {TRAINING_CARDS.map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15 + i * 0.06 }}
            >
              <button
                type="button"
                onClick={() => setView(card.action.view, card.action.params)}
                className={`glass group relative flex h-32 w-full cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-[var(--glass-border)] p-4 text-start transition-all hover:-translate-y-1 ${card.hoverBorder}`}
              >
                <span
                  className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold transition-colors ${card.chip}`}
                >
                  <card.icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="mt-auto">
                  <span className="block text-sm font-bold">{card.title}</span>
                  <span className="block text-[10px] opacity-70">{card.subtitle}</span>
                </span>
              </button>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ===== 3) التحديات والاختبارات — توهج برتقالي وبنفسجي ===== */}
      <section className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        {CHALLENGE_CARDS.map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.3 + i * 0.08 }}
          >
            <button
              type="button"
              onClick={() => setView(card.view)}
              className={`glass group relative w-full cursor-pointer overflow-hidden rounded-3xl border p-6 text-start transition-all hover:-translate-y-1 ${card.glow} ${card.hoverGlow}`}
            >
              <div
                className={`pointer-events-none absolute -ml-10 -mt-10 left-0 top-0 h-32 w-32 rounded-full blur-3xl transition-colors ${card.blur}`}
              />
              <div className="relative z-10 flex items-center justify-between gap-4">
                <div>
                  <div
                    className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl shadow-inner backdrop-blur-md ${card.chip}`}
                  >
                    <card.icon className="h-5 w-5" aria-hidden />
                  </div>
                  <span className="mb-1 block text-xl font-black">{card.title}</span>
                  <span className="block max-w-[200px] text-xs font-medium opacity-80">{card.subtitle}</span>
                </div>
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 transition-all ${card.circle}`}
                >
                  <ArrowRight className="h-5 w-5" aria-hidden />
                </div>
              </div>
            </button>
          </motion.div>
        ))}
      </section>

      {/* ===== تحسين: تنبيه قرب انتهاء الصلاحية (بديل SweetAlert القديم) ===== */}
      <AlertDialog
        open={showExpiryWarning}
        onOpenChange={(open) => {
          if (!open) dismissExpiryWarning();
        }}
      >
        <AlertDialogContent className="border-warning/40 bg-background/90 shadow-2xl backdrop-blur-xl">
          <AlertDialogHeader className="items-center text-center">
            <div className="mx-auto mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
              <TriangleAlert className="h-7 w-7" aria-hidden />
            </div>
            <AlertDialogTitle className="text-lg font-bold">تنبيه هام</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              صلاحية اشتراكك قاربت على الانتهاء. يرجى مراجعة المدرب.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center">
            <AlertDialogAction className="gradient-primary font-bold text-white" onClick={dismissExpiryWarning}>
              حسناً
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
