"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ViewId, useUIStore } from "@/lib/ui-store";
import { useAuth } from "@/components/auth-context";
import {
  generateQuestion,
  makeRng,
  GameSettings,
  QuestionType,
  Question,
} from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowRight,
  StopCircle,
  Trophy,
  Clock,
  Hash,
} from "lucide-react";
import { toast } from "sonner";
import { GameKeypad } from "@/components/game/keypad";
import { QuestionDisplay } from "@/components/game/question-display";
import { Countdown } from "@/components/game/countdown";
import { ResultsModal, ResultRow, downloadTrainingPdf } from "@/components/game/results-modal";
import { AbacusGame } from "@/components/game/abacus";

interface GameViewProps {
  view: ViewId;
  params: Record<string, string>;
}

const VIEW_TO_TYPE: Record<string, { type: QuestionType; title: string; gradient: string; opColor: string; accentColor: string }> = {
  "game-add-sub": {
    type: "addition_subtraction",
    title: "الجمع والطرح",
    gradient: "from-emerald-500 to-teal-600",
    opColor: "text-emerald-500",
    accentColor: "text-warning",
  },
  "game-mult": {
    type: "multiplication",
    title: "الضرب",
    gradient: "from-orange-500 to-red-600",
    opColor: "text-orange-500",
    accentColor: "text-warning",
  },
  "game-div": {
    type: "division",
    title: "القسمة",
    gradient: "from-cyan-500 to-blue-600",
    opColor: "text-cyan-500",
    accentColor: "text-warning",
  },
};

export function GameView({ view, params }: GameViewProps) {
  // ----- Abacus branch -----
  if (view === "game-abacus") {
    return <AbacusView params={params} />;
  }
  return <MathGameView view={view} params={params} />;
}

// ---------------------------------------------------------------------------
// Abacus view (no save)
// ---------------------------------------------------------------------------

function AbacusView({ params }: { params: Record<string, string> }) {
  const setView = useUIStore((s) => s.setView);
  const rods = clampInt(parseInt(params.rods ?? "5"), 3, 13);
  const mode = (params.abacusMode === "challenge" ? "challenge" : "free") as "free" | "challenge";

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8" dir="rtl">
      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setView("trainings")}>
          <ArrowRight className="h-4 w-4" />
          أنواع التدريب
        </Button>
        <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
          الأباكوس (سوروبان)
        </h1>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
        <Card className="glass border border-[var(--glass-border)] p-2 text-center sm:p-3">
          <Hash className="mx-auto h-4 w-4 text-primary" />
          <div className="font-mono text-sm font-bold sm:text-base">{rods}</div>
          <div className="text-[10px] text-muted-foreground">سلاك</div>
        </Card>
        <Card className="glass border border-[var(--glass-border)] p-2 text-center sm:p-3">
          <Trophy className="mx-auto h-4 w-4 text-accent" />
          <div className="font-mono text-sm font-bold sm:text-base">{mode === "free" ? "حر" : "تحدّي"}</div>
          <div className="text-[10px] text-muted-foreground">الوضع</div>
        </Card>
        <Card className="glass border border-[var(--glass-border)] p-2 text-center sm:p-3">
          <Clock className="mx-auto h-4 w-4 text-warning" />
          <div className="font-mono text-sm font-bold sm:text-base">∞</div>
          <div className="text-[10px] text-muted-foreground">تدريب حر</div>
        </Card>
      </div>

      <AbacusGame key={`${rods}-${mode}`} rods={rods} mode={mode} />

      <p className="mt-6 text-center text-xs text-muted-foreground">
        الأباكوس (سوروبان): كل سلك يحمل خرزة علوية (قيمتها 5) و4 خرزات سفلية (كلٌّ قيمتها 1).
        النقر على الخرزة يفعّل/يبطل قيمتها. اضغط «تصفير» لإعادة الكل إلى الصفر.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Math game view (add/sub, mult, div)
// ---------------------------------------------------------------------------

function MathGameView({ view, params }: { view: ViewId; params: Record<string, string> }) {
  const meta = VIEW_TO_TYPE[view];
  if (!meta) {
    return (
      <div className="mx-auto w-full max-w-md p-6 text-center" dir="rtl">
        نوع لعبة غير معروف.
      </div>
    );
  }
  return <MathGameInner view={view} params={params} meta={meta} />;
}

function MathGameInner({
  view,
  params,
  meta,
}: {
  view: ViewId;
  params: Record<string, string>;
  meta: { type: QuestionType; title: string; gradient: string; opColor: string; accentColor: string };
}) {
  const setView = useUIStore((s) => s.setView);
  const { user, refresh } = useAuth();

  // Parse settings from params (string -> typed)
  const settings: GameSettings = useMemo(() => {
    const seed = params.seed ?? "default-seed";
    const displayMethod = (params.displayMethod === "full" ? "full" : "sequential") as
      | "sequential"
      | "full";
    const displayTime = clampFloat(parseFloat(params.displayTime ?? "1.5"), 0.3, 5);
    const disappearTime = clampFloat(parseFloat(params.disappearTime ?? "0.5"), 0.1, 3);

    switch (meta.type) {
      case "addition_subtraction":
        return {
          type: "addition_subtraction",
          numberLength: clampInt(parseInt(params.numberLength ?? "1"), 1, 4),
          termsCount: clampInt(parseInt(params.termsCount ?? "2"), 2, 20),
          displayTime,
          disappearTime,
          displayMethod,
          seed,
        };
      case "multiplication":
        return {
          type: "multiplication",
          num1Length: clampInt(parseInt(params.num1Length ?? "2"), 1, 4),
          num2Length: clampInt(parseInt(params.num2Length ?? "1"), 1, 3),
          displayTime,
          disappearTime,
          displayMethod,
          seed,
        };
      case "division":
        return {
          type: "division",
          dividendLength: clampInt(parseInt(params.dividendLength ?? "3"), 2, 4),
          divisorLength: clampInt(parseInt(params.divisorLength ?? "1"), 1, 2),
          displayTime,
          disappearTime,
          displayMethod,
          seed,
        };
      default:
        // shouldn't happen
        return {
          type: "addition_subtraction" as const,
          numberLength: 1,
          termsCount: 2,
          displayTime,
          disappearTime,
          displayMethod,
          seed,
        };
    }
  }, [view, params, meta.type]);

  // Solving method (add/sub only): direct | friendsOf5 | friendsOf10.
  // Parsed separately from params because GameSettings (lib/game) doesn't
  // carry it yet — it still flows into the saved payload below.
  const solvingMethod = useMemo(
    () => parseSolvingMethod(params.solvingMethod),
    [params.solvingMethod]
  );

  // ----- Game state -----
  const [phase, setPhase] = useState<"countdown" | "playing" | "results">("countdown");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [currentQ, setCurrentQ] = useState<Question | null>(null);
  const [userInput, setUserInput] = useState("");
  const [inputEnabled, setInputEnabled] = useState(false);
  const [liveScore, setLiveScore] = useState(0);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [timesMs, setTimesMs] = useState<number[]>([]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const questionStartRef = useRef<number>(0);
  const liveScoreRef = useRef(0);
  liveScoreRef.current = liveScore;

  // Generate first question when countdown completes
  const generateFor = useCallback(
    (index: number): Question => {
      // أصدقاء الخمسة/العشرة: complement-pair generation, seeded with the
      // SAME `seed-type-index` derivation as lib/game's generateQuestion
      // so every (seed, index) is fully deterministic.
      if (
        meta.type === "addition_subtraction" &&
        (solvingMethod === "friendsOf5" || solvingMethod === "friendsOf10")
      ) {
        const rng = makeRng(
          `${settings.seed ?? "default"}-addition_subtraction-${index}`
        );
        return generateAddSubFriends(
          rng,
          solvingMethod,
          settings.numberLength ?? 1,
          settings.termsCount ?? 2
        );
      }
      return generateQuestion({ ...settings, seed: settings.seed ?? "x" }, String(index));
    },
    [settings, solvingMethod, meta.type]
  );

  useEffect(() => {
    if (phase !== "playing") return;
    const q = generateFor(questionIndex);
    setCurrentQ(q);
    setUserInput("");
    setInputEnabled(false);
    // The QuestionDisplay will call onReady when ready; that's when we start the timer.
  }, [phase, questionIndex, generateFor]);

  // Physical keyboard input (0-9, Enter, Backspace, Escape)
  useEffect(() => {
    if (phase !== "playing" || !inputEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        addDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        deleteDigit();
      } else if (e.key === "Enter") {
        e.preventDefault();
        submitAnswer();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleStop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, inputEnabled, userInput]);

  function addDigit(d: string) {
    if (!inputEnabled) return;
    setUserInput((prev) => (prev.length >= 9 ? prev : prev + d));
  }
  function deleteDigit() {
    if (!inputEnabled) return;
    setUserInput((prev) => prev.slice(0, -1));
  }
  function onReady() {
    setInputEnabled(true);
    questionStartRef.current = performance.now();
  }
  function submitAnswer() {
    if (!inputEnabled || !currentQ) return;
    if (!userInput) {
      toast.error("أدخل إجابة أولاً");
      return;
    }
    const end = performance.now();
    const dt = end - questionStartRef.current;
    const userNum = parseInt(userInput, 10);
    const isCorrect = !Number.isNaN(userNum) && userNum === currentQ.answer;

    const row: ResultRow = {
      questionIndex,
      questionText: currentQ.text,
      correctAnswer: currentQ.answer,
      userAnswer: Number.isNaN(userNum) ? userInput : userNum,
      isCorrect,
      timeTaken: dt / 1000,
    };
    setResults((r) => [...r, row]);
    setTimesMs((t) => [...t, dt]);
    if (isCorrect) setLiveScore(liveScoreRef.current + 1);
    setInputEnabled(false);

    // brief pause before next
    setTimeout(() => {
      setQuestionIndex((i) => i + 1);
    }, 700);
  }
  function handleStop() {
    if (phase === "countdown") return;
    setPhase("results");
    setInputEnabled(false);
  }

  // Save handler: POST to /api/training/save
  async function handleSave() {
    if (!user) {
      toast.error("يجب تسجيل الدخول");
      return;
    }
    if (saved) return;
    setSaving(true);
    try {
      const res = await fetch("/api/training/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          gameType: meta.type,
          // solvingMethod rides along for add/sub so the persisted settings
          // record which technique was trained.
          settings:
            meta.type === "addition_subtraction"
              ? { ...settings, solvingMethod }
              : settings,
          seed: settings.seed,
          answers: results.map((r) => ({ questionIndex: r.questionIndex, userAnswer: r.userAnswer })),
          // Server caps each question's time at 60s — clamp so a slow
          // (or idle) player never fails the whole save.
          timesMs: timesMs.map((t) => Math.min(Math.max(t, 0), 60_000)),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "فشل الحفظ");
      setSaved(true);
      toast.success(`تم الحفظ! +${json.data?.pointsAwarded ?? 0} نقطة`);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadPdf() {
    try {
      await downloadTrainingPdf();
      toast.success("تم تحميل التقرير");
    } catch (e) {
      toast.error("تعذّر توليد PDF");
    }
  }

  function handleExit() {
    setView("trainings");
  }

  // ----- Render -----
  if (phase === "countdown") {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6" dir="rtl">
        <PreGameCard settings={settings} meta={meta} solvingMethod={solvingMethod} />
        <Countdown onComplete={() => setPhase("playing")} />
      </div>
    );
  }

  if (phase === "results") {
    const correctCount = results.filter((r) => r.isCorrect).length;
    const totalCount = results.length;
    const averageScore = totalCount ? (correctCount / totalCount) * 100 : 0;
    const totalTimeMs = timesMs.reduce((s, t) => s + t, 0);
    const averageTimeMs = totalCount ? totalTimeMs / totalCount : 0;

    return (
      <>
        <ResultsModal
          open={true}
          rows={results}
          correctCount={correctCount}
          totalCount={totalCount}
          averageScore={averageScore}
          totalTimeMs={totalTimeMs}
          averageTimeMs={averageTimeMs}
          studentName={user?.studentName ?? "طالب"}
          gameTitle={meta.title}
          settingsSummary={summarizeSettings(settings, solvingMethod)}
          dateLabel={new Date().toLocaleString("ar-EG")}
          saving={saving}
          onSave={handleSave}
          onDownloadPdf={handleDownloadPdf}
          onExit={handleExit}
        />
        <div className="mx-auto w-full max-w-2xl px-4 py-8 text-center" dir="rtl">
          <Card className="glass border border-[var(--glass-border)] p-6">
            <Trophy className="mx-auto mb-3 h-10 w-10 text-primary" />
            <h2 className="text-lg font-bold">انتهت الجلسة</h2>
            <p className="text-sm text-muted-foreground">
              {correctCount}/{totalCount} إجابة صحيحة
            </p>
          </Card>
        </div>
      </>
    );
  }

  // phase === "playing"
  const progress = ((questionIndex % 100) + 1) % 100;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-6" dir="rtl">
      {/* Top bar */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={handleStop} className="text-destructive hover:text-destructive">
          <StopCircle className="h-4 w-4" />
          إيقاف
        </Button>
        <div className="flex items-center gap-2">
          <Badge className="glass gap-1" variant="secondary">
            <Hash className="h-3 w-3 text-primary" />
            <span className="font-mono">{questionIndex + 1}</span>
            سؤال
          </Badge>
          <Badge className="glass gap-1" variant="secondary">
            <Trophy className="h-3 w-3 text-success" />
            <span className="font-mono">{liveScore}</span>
            صحيحة
          </Badge>
        </div>
      </div>

      <Progress value={Math.min(progress, 100)} className="mb-4" />

      {/* Question card */}
      <Card className={`glass border border-[var(--glass-border)] p-4 sm:p-6`}>
        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-mono">
            {meta.type === "addition_subtraction"
              ? `${SOLVING_METHOD_LABELS[solvingMethod]} · `
              : ""}
            {settings.displayMethod === "sequential" ? "وضع متسلسل" : "وضع كامل"}
          </span>
          <span className="font-mono">
            {settings.displayTime}ث عرض · {settings.disappearTime}ث اخفاء
          </span>
        </div>
        {currentQ ? (
          <QuestionDisplay
            question={currentQ}
            displayMethod={settings.displayMethod ?? "sequential"}
            displayTime={settings.displayTime ?? 1.5}
            disappearTime={settings.disappearTime ?? 0.5}
            questionIndex={questionIndex}
            onReady={onReady}
            operatorColor={meta.opColor}
            accentColor={meta.accentColor}
          />
        ) : null}

        {/* Input display */}
        <div className="my-4 flex items-center justify-center">
          <motion.div
            animate={{
              boxShadow: inputEnabled
                ? "0 0 0 3px var(--ring)"
                : "0 0 0 0 transparent",
              opacity: inputEnabled ? 1 : 0.5,
            }}
            className="glass-input flex min-h-16 min-w-32 items-center justify-center rounded-2xl px-6 font-mono text-3xl font-bold sm:text-4xl"
            dir="ltr"
          >
            {userInput || <span className="text-muted-foreground">؟</span>}
          </motion.div>
        </div>
      </Card>

      {/* Keypad */}
      <div className="mt-4">
        <GameKeypad
          onNum={addDigit}
          onDelete={deleteDigit}
          onSubmit={submitAnswer}
          disabled={!inputEnabled}
          submitDisabled={!userInput}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SolvingMethod = "direct" | "friendsOf5" | "friendsOf10";

const SOLVING_METHOD_LABELS: Record<SolvingMethod, string> = {
  direct: "مباشرة",
  friendsOf5: "أصدقاء الخمسة",
  friendsOf10: "أصدقاء العشرة",
};

function parseSolvingMethod(v: string | undefined): SolvingMethod {
  return v === "friendsOf5" || v === "friendsOf10" ? v : "direct";
}

function randIntLocal(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * أصدقاء الخمسة/العشرة question generator (legacy solvingMethod option,
 * implemented for real). Terms after the first come in complement pairs
 * (a, target−a): every two consecutive operands sum exactly to the target
 * (5 or 10) — the classic mental-math "friends" technique. Each pair shares
 * one randomly-chosen sign (… + a + (target−a) … or … − a − (target−a) …)
 * while guarding the running total ≥ 0 and ≤ 10,000,000. A lone trailing
 * term (odd termsCount) gets a single guarded sign. Deterministic per rng.
 */
function generateAddSubFriends(
  rng: () => number,
  method: Exclude<SolvingMethod, "direct">,
  numberLength: number,
  termsCount: number
): Question {
  const target = method === "friendsOf5" ? 5 : 10;

  // Classic two-term drill: either "a + (target−a)" (the friend pair,
  // e.g. "2 + 3" / "8 + 2") or "target − a" (the answer IS the friend,
  // e.g. "5 − 2 = 3" / "10 − 7 = 3").
  if (termsCount <= 2) {
    const a = randIntLocal(rng, 1, target - 1);
    const b = target - a;
    if (rng() > 0.5) {
      return { text: `${a} + ${b}`, answer: target, terms: [a, "+", b] };
    }
    return { text: `${target} - ${a}`, answer: b, terms: [target, "-", a] };
  }

  const max = Math.pow(10, numberLength);

  let total = randIntLocal(rng, 0, max - 1);
  const terms: (number | string)[] = [total];

  let remaining = termsCount - 1;
  while (remaining > 0) {
    if (remaining >= 2) {
      const a = randIntLocal(rng, 1, target - 1);
      const b = target - a; // the friend/complement
      const negative = rng() > 0.5;
      if (negative && total - (a + b) >= 0) {
        terms.push("-", a, "-", b);
        total -= a + b;
      } else {
        terms.push("+", a, "+", b);
        total += a + b;
      }
      remaining -= 2;
    } else {
      // Odd tail: a single friend value with a guarded sign.
      const a = randIntLocal(rng, 1, target - 1);
      if (rng() > 0.5 && total - a >= 0) {
        terms.push("-", a);
        total -= a;
      } else {
        terms.push("+", a);
        total += a;
      }
      remaining -= 1;
    }
  }

  return { text: terms.join(" "), answer: total, terms };
}

function clampInt(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, Math.round(v)));
}
function clampFloat(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function summarizeSettings(s: GameSettings, solvingMethod: SolvingMethod = "direct"): string {
  switch (s.type) {
    case "addition_subtraction":
      return `${s.numberLength} خانة · ${s.termsCount} حدود · ${SOLVING_METHOD_LABELS[solvingMethod]} · ${s.displayMethod === "sequential" ? "متسلسل" : "كامل"}`;
    case "multiplication":
      return `${s.num1Length}×${s.num2Length} خانات · ${s.displayMethod === "sequential" ? "متسلسل" : "كامل"}`;
    case "division":
      return `${s.dividendLength}÷${s.divisorLength} خانات · ${s.displayMethod === "sequential" ? "متسلسل" : "كامل"}`;
    default:
      return JSON.stringify(s);
  }
}

function PreGameCard({
  settings,
  meta,
  solvingMethod,
}: {
  settings: GameSettings;
  meta: { type: QuestionType; title: string; gradient: string; opColor: string; accentColor: string };
  solvingMethod: SolvingMethod;
}) {
  const setView = useUIStore((s) => s.setView);
  return (
    <Card className="glass border border-[var(--glass-border)] p-6 text-center">
      <div className={`mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${meta.gradient} text-white shadow-lg`}>
        <Trophy className="h-8 w-8" />
      </div>
      <h1 className="mb-2 text-xl font-bold sm:text-2xl">{meta.title}</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        الاستعدادات جارية… ابدأ التركيز، فالعد التنازلي على وشك البدء!
      </p>
      <div className="mx-auto max-w-xs">
        <Badge variant="secondary" className="glass mb-1 w-full justify-center gap-1.5">
          <Hash className="h-3 w-3 text-primary" />
          {summarizeSettings(settings, solvingMethod)}
        </Badge>
      </div>
      <Button variant="ghost" size="sm" className="mt-4" onClick={() => setView("trainings")}>
        <ArrowRight className="h-4 w-4" />
        إلغاء
      </Button>
    </Card>
  );
}
