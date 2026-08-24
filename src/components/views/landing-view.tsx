"use client";

import { motion } from "framer-motion";
import { useUIStore } from "@/lib/ui-store";
import { useAuth } from "@/components/auth-context";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/*  Legacy index.php landing — ONE centered glass card that holds     */
/*  everything: logo → title → typing description → buttons →         */
/*  features → support footer. Recreated with framer-motion for the   */
/*  signature word-by-word reveal (90ms per word, like the original). */
/* ------------------------------------------------------------------ */

/** Module-level so it's computed once per process (hydration-safe year). */
const YEAR = new Date().getFullYear();

/** The legacy typing-description text (revealed word by word). */
const DESCRIPTION =
  "منصة تعليمية متكاملة تدمج بين المتعة والتعلم. نستخدم أحدث تقنيات الحساب الذهني والذكاء الاصطناعي لرفع مستوى التركيز وتعزيز الصحة العقلية لطفلك.";

const WORDS = DESCRIPTION.split(" ");

/** Typing cadence — 90ms per word, starting 500ms in (legacy setTimeout 600). */
const TYPING_START = 0.5;
const WORD_STEP = 0.09;
const WORDS_DONE = TYPING_START + WORDS.length * WORD_STEP + 0.3;

/** Legacy showRestOfPage(): buttons → features → footer, +150ms each. */
const BUTTONS_DELAY = WORDS_DONE + 0.2;
const FEATURES_DELAY = BUTTONS_DELAY + 0.15;
const FOOTER_DELAY = FEATURES_DELAY + 0.15;

/** Legacy .btn-glow-primary — indigo gradient + lift & glow on hover. */
const PRIMARY_BUTTON =
  "gradient-primary w-full rounded-xl px-8 text-base font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-5px_rgba(79,70,229,0.5)] sm:w-auto";

/** Legacy .btn-glow-secondary — subtle glass + indigo border on hover. */
const SECONDARY_BUTTON =
  "glass w-full rounded-xl border border-[var(--glass-border)] px-8 text-base font-bold text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-indigo-500 hover:bg-white/10 hover:text-foreground sm:w-auto";

/** The 3 legacy feature cards + 3 extra (security / trainings / community). */
const FEATURES = [
  {
    emoji: "🏆",
    title: "منافسات وتحديات",
    desc: "شارك في أقوى المسابقات الحية وتحدى أصدقائك لرفع مستوى التركيز.",
    color: "text-indigo-500",
  },
  {
    emoji: "📈",
    title: "مناهج متطورة",
    desc: "نظام تدريب عقلي شامل لتنمية الذاكرة والإبداع وفق أحدث المعايير.",
    color: "text-purple-500",
  },
  {
    emoji: "🤖",
    title: "تحدي الروبوت",
    desc: "واجه الذكاء الاصطناعي في اختبارات رياضية متدرجة الصعوبة.",
    color: "text-pink-500",
  },
  {
    emoji: "🛡️",
    title: "بياناتك في أمان",
    desc: "بنية أمنية حديثة: تشفير bcrypt وجلسات JWT وخصوصية كاملة لطفلك.",
    color: "text-emerald-500",
  },
  {
    emoji: "🧮",
    title: "أربعة أنواع تدريب",
    desc: "جمع وطرح، ضرب، قسمة، وأباكوس سوروبان — بمستويات صعوبة متدرجة.",
    color: "text-cyan-500",
  },
  {
    emoji: "👥",
    title: "مجتمع وتعلّم جماعي",
    desc: "لوحة متصدّرين وصداقات وتدريبات جماعية تحفّز طفلك على التميّز.",
    color: "text-amber-500",
  },
];

export function LandingView() {
  const setView = useUIStore((s) => s.setView);
  const { user } = useAuth();

  return (
    <div className="mx-auto flex w-full max-w-4xl items-center px-4 py-8 sm:py-12 md:min-h-[calc(100svh-9rem)]">
      {/* ===== the single legacy glass card ===== */}
      <div className="glass relative w-full overflow-hidden rounded-3xl border border-[var(--glass-border)] p-6 text-center sm:p-8 md:p-10">
        {/* top color bar — legacy signature */}
        <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

        {/* logo with glow */}
        <div className="group relative mb-6 inline-block">
          <div className="absolute inset-0 rounded-full bg-indigo-500 opacity-20 blur-[20px] transition duration-500 group-hover:opacity-40" />
          <div className="relative z-10 mx-auto flex h-20 w-20 animate-pulse items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800 to-slate-900 shadow-xl">
            <span className="text-4xl drop-shadow-lg">🧠</span>
          </div>
        </div>

        {/* title */}
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="mb-4 text-3xl font-extrabold tracking-tight md:text-5xl"
        >
          منصة{" "}
          <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            e-learn
          </span>
          <span className="mt-2 block text-lg font-medium text-muted-foreground md:text-2xl">
            للحساب الذهني وتطوير القدرات
          </span>
        </motion.h1>

        {/* typing description — word by word reveal (legacy signature) */}
        <div className="mx-auto mb-10 flex h-24 max-w-2xl items-center justify-center px-2 text-base leading-relaxed md:h-20 md:text-lg">
          <p className="font-medium text-muted-foreground">
            {WORDS.map((word, i) => (
              <motion.span
                key={`${word}-${i}`}
                className="ml-[0.3em] inline-block"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: TYPING_START + i * WORD_STEP, duration: 0.3 }}
              >
                {word}
              </motion.span>
            ))}
          </p>
        </div>

        {/* buttons (fade in once the typing finishes — legacy behavior) */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: BUTTONS_DELAY }}
          className="flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          {user ? (
            <Button
              size="lg"
              className={PRIMARY_BUTTON}
              onClick={() => setView(user.role === "admin" ? "admin-users" : "dashboard")}
            >
              🚀 ابدأ التحدّي الآن
            </Button>
          ) : (
            <>
              <Button size="lg" className={PRIMARY_BUTTON} onClick={() => setView("login")}>
                🚀 تسجيل الدخول
              </Button>
              <Button size="lg" variant="ghost" className={SECONDARY_BUTTON} onClick={() => setView("register")}>
                ✨ حساب جديد
              </Button>
            </>
          )}
        </motion.div>

        {/* features */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: FEATURES_DELAY }}
          className="mt-10 grid grid-cols-1 gap-4 border-t border-white/10 pt-8 text-right md:grid-cols-3"
        >
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className="glass rounded-xl p-4 transition-all hover:-translate-y-1 hover:bg-white/10"
            >
              <div className="mb-2 text-2xl">{f.emoji}</div>
              <h2 className={`mb-1 text-base font-bold ${f.color}`}>{f.title}</h2>
              <p className="text-xs leading-relaxed text-muted-foreground">{f.desc}</p>
            </article>
          ))}
        </motion.section>

        {/* footer support card */}
        <motion.footer
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: FOOTER_DELAY }}
          className="mt-10 flex flex-col items-center gap-4"
        >
          <div className="group w-full max-w-sm cursor-pointer rounded-xl border border-indigo-500/20 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 p-3 text-center backdrop-blur-sm transition-all hover:border-indigo-400/40">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-indigo-400">
              للدعم الفني والاستفسارات
            </p>
            <a
              href="tel:0122147212"
              dir="ltr"
              className="flex items-center justify-center gap-2 text-xl font-black transition-transform group-hover:scale-105"
            >
              <span>📞</span>
              <span className="font-mono">0122147212</span>
            </a>
          </div>
          <div className="font-mono text-[10px] text-muted-foreground">
            © {YEAR} e-learn. جميع الحقوق محفوظة.
          </div>
        </motion.footer>
      </div>
    </div>
  );
}
