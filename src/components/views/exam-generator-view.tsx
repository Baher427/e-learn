"use client";

import { useState, useEffect, useCallback, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/components/auth-context";
import { useUIStore } from "@/lib/ui-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Bot,
  Brain,
  FileText,
  Plus,
  X,
  Divide,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Check,
  Loader2,
  RefreshCw,
  Download,
  ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { generateExamPdf, ExamSettings } from "@/lib/exam-pdf";

// --------------------------------------------------------------------
// Types & constants
// --------------------------------------------------------------------

type SolvingMethod = "direct" | "friendsOf5" | "friendsOf10" | "friendsOf5And10";
type DecimalOption = "integers" | "decimals";
type ColumnsCount = 5 | 10;

interface WizardSettings {
  examTitle: string;
  columnsCount: ColumnsCount;
  as_questionsCount: number;
  as_numberLength: number;
  as_termsCount: number;
  as_solvingMethod: SolvingMethod;
  mul_questionsCount: number;
  mul_num1Length: number;
  mul_num2Length: number;
  div_questionsCount: number;
  div_dividendLength: number;
  div_divisorLength: number;
  div_decimalOption: DecimalOption;
  im_questionsCount: number;
  im_numberLength: number;
  im_termsCount: number;
  im_solvingMethod: SolvingMethod;
}

const DEFAULT_SETTINGS: WizardSettings = {
  examTitle: "",
  columnsCount: 5,
  as_questionsCount: 0,
  as_numberLength: 2,
  as_termsCount: 3,
  as_solvingMethod: "direct",
  mul_questionsCount: 0,
  mul_num1Length: 2,
  mul_num2Length: 1,
  div_questionsCount: 0,
  div_dividendLength: 3,
  div_divisorLength: 1,
  div_decimalOption: "integers",
  im_questionsCount: 0,
  im_numberLength: 2,
  im_termsCount: 3,
  im_solvingMethod: "direct",
};

const STEPS: { icon: typeof FileText; label: string }[] = [
  { icon: FileText, label: "عام" },
  { icon: Plus, label: "جمع/طرح" },
  { icon: X, label: "ضرب" },
  { icon: Divide, label: "قسمة" },
  { icon: Brain, label: "تخيّل" },
];

const SOLVING_METHODS: { value: SolvingMethod; label: string }[] = [
  { value: "direct", label: "مباشر" },
  { value: "friendsOf5", label: "أصدقاء ٥" },
  { value: "friendsOf10", label: "أصدقاء ١٠" },
  { value: "friendsOf5And10", label: "٥ و ١٠" },
];

const DECIMAL_OPTIONS: { value: DecimalOption; label: string }[] = [
  { value: "integers", label: "أعداد صحيحة" },
  { value: "decimals", label: "أعداد عشرية" },
];

// --------------------------------------------------------------------
// Small reusable field components
// --------------------------------------------------------------------

function CountSlider({
  value,
  onChange,
  max = 100,
}: {
  value: number;
  onChange: (v: number) => void;
  max?: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>عدد الأسئلة</Label>
        <span
          className={`rounded-md px-2 py-0.5 font-mono text-sm ${
            value === 0
              ? "bg-muted text-muted-foreground"
              : "bg-primary/15 text-primary"
          }`}
        >
          {value === 0 ? "متخطّى" : value}
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={(v) => onChange(v[0])}
        min={0}
        max={max}
        step={1}
        className="py-2"
      />
      <p className="text-xs text-muted-foreground">
        0 = تخطّي · الحد الأدنى ٥ · الحد الأقصى {max}
      </p>
    </div>
  );
}

function LengthSlider({
  label,
  value,
  onChange,
  min,
  max,
  suffix = "خانة",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  suffix?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="rounded-md bg-primary/15 px-2 py-0.5 font-mono text-sm text-primary">
          {value} {suffix}
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={(v) => onChange(v[0])}
        min={min}
        max={max}
        step={1}
        className="py-2"
      />
    </div>
  );
}

function OptionButtons<T extends string | number>({
  value,
  onChange,
  options,
  cols = 2,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  cols?: 2 | 4;
}) {
  const gridClass = cols === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2";
  return (
    <div className={`grid ${gridClass} gap-2`}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`h-12 rounded-lg text-sm font-medium transition-all ${
              active
                ? "gradient-primary text-white shadow-md"
                : "glass text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// --------------------------------------------------------------------
// Main view
// --------------------------------------------------------------------

export function ExamGeneratorView() {
  const setView = useUIStore((s) => s.setView);
  const { user } = useAuth();

  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState<WizardSettings>(DEFAULT_SETTINGS);
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [examId, setExamId] = useState<string | null>(null);

  const update = useCallback(
    <K extends keyof WizardSettings>(k: K, v: WizardSettings[K]) =>
      setSettings((s) => ({ ...s, [k]: v })),
    []
  );

  // Cleanup blob URL on unmount or when replacing
  useEffect(() => {
    return () => {
      if (pdfUrl) {
        try {
          URL.revokeObjectURL(pdfUrl);
        } catch {
          /* noop */
        }
      }
    };
  }, [pdfUrl]);

  const totalCount =
    settings.as_questionsCount +
    settings.mul_questionsCount +
    settings.div_questionsCount +
    settings.im_questionsCount;

  // Validate the current step. Returns an Arabic error message or null.
  const validateStep = (s: number): string | null => {
    if (s === 0) {
      const title = settings.examTitle.trim();
      if (title.length < 3) return "العنوان ٣ أحرف على الأقل";
      if (title.length > 30) return "العنوان ٣٠ حرفاً على الأكثر";
      if (!/^[a-zA-Z0-9 ]+$/.test(title))
        return "حروف وأرقام إنجليزية ومسافات فقط";
    }
    if (s === 1 && settings.as_questionsCount !== 0 && settings.as_questionsCount < 5)
      return "عدد أسئلة الجمع/الطرح يجب أن يكون ٠ أو ٥ على الأقل";
    if (s === 2 && settings.mul_questionsCount !== 0 && settings.mul_questionsCount < 5)
      return "عدد أسئلة الضرب يجب أن يكون ٠ أو ٥ على الأقل";
    if (s === 3) {
      if (settings.div_questionsCount !== 0 && settings.div_questionsCount < 5)
        return "عدد أسئلة القسمة يجب أن يكون ٠ أو ٥ على الأقل";
      if (
        settings.div_decimalOption === "integers" &&
        settings.div_dividendLength < settings.div_divisorLength
      )
        return "في القسمة الصحيحة: طول المقسوم يجب أن يكون ≥ طول المقسوم عليه";
    }
    if (s === 4 && settings.im_questionsCount !== 0 && settings.im_questionsCount < 5)
      return "عدد أسئلة التخيّل يجب أن يكون ٠ أو ٥ على الأقل";
    return null;
  };

  const next = () => {
    const err = validateStep(step);
    if (err) {
      toast.error(err);
      return;
    }
    setStep((s) => Math.min(s + 1, 4));
  };

  const prev = () => setStep((s) => Math.max(0, s - 1));

  const skip = () => {
    if (step === 1) update("as_questionsCount", 0);
    else if (step === 2) update("mul_questionsCount", 0);
    else if (step === 3) update("div_questionsCount", 0);
    else if (step === 4) update("im_questionsCount", 0);
    toast.success("تم تخطّي هذا القسم");
    if (step < 4) setStep((s) => s + 1);
  };

  const buildExamSettings = (): ExamSettings => ({
    as_questionsCount: settings.as_questionsCount,
    as_numberLength: settings.as_numberLength,
    as_termsCount: settings.as_termsCount,
    as_solvingMethod: settings.as_solvingMethod,
    mul_questionsCount: settings.mul_questionsCount,
    mul_num1Length: settings.mul_num1Length,
    mul_num2Length: settings.mul_num2Length,
    div_questionsCount: settings.div_questionsCount,
    div_dividendLength: settings.div_dividendLength,
    div_divisorLength: settings.div_divisorLength,
    div_decimalOption: settings.div_decimalOption,
    im_questionsCount: settings.im_questionsCount,
    im_numberLength: settings.im_numberLength,
    im_termsCount: settings.im_termsCount,
    im_solvingMethod: settings.im_solvingMethod,
  });

  const buildSelectedOps = (): string[] => {
    const ops: string[] = [];
    if (settings.as_questionsCount > 0) ops.push("add_sub");
    if (settings.mul_questionsCount > 0) ops.push("multiply");
    if (settings.div_questionsCount > 0) ops.push("divide");
    if (settings.im_questionsCount > 0) ops.push("imagination");
    return ops;
  };

  const generatePdf = useCallback(async () => {
    setGenerating(true);
    try {
      // Tiny defer so the spinner can paint before the (synchronous) PDF work blocks the main thread.
      await new Promise((r) => setTimeout(r, 30));
      const url = generateExamPdf({
        examTitle: settings.examTitle.trim(),
        username: user?.username ?? "user",
        columnsCount: settings.columnsCount,
        settings: buildExamSettings(),
      });
      // Revoke old URL before swapping in the new one
      setPdfUrl((old) => {
        if (old) {
          try {
            URL.revokeObjectURL(old);
          } catch {
            /* noop */
          }
        }
        return url;
      });
    } catch (e) {
      console.error("PDF generation failed:", e);
      toast.error("فشل توليد ملف PDF");
    } finally {
      setGenerating(false);
    }
  }, [settings, user]);

  const submit = async () => {
    const err = validateStep(4);
    if (err) {
      toast.error(err);
      return;
    }
    if (totalCount === 0) {
      toast.error("اختر قسماً واحداً على الأقل");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/exam/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          examTitle: settings.examTitle.trim(),
          columnsCount: settings.columnsCount,
          settings: buildExamSettings(),
          selectedOps: buildSelectedOps(),
        }),
      });
      const j = await res.json();
      if (j.status === "success") {
        setExamId(j.data.examId);
        toast.success(`تم إنشاء الامتحان! (${j.data.questionsCount} سؤال)`);
        // Auto-generate the PDF preview
        await generatePdf();
      } else {
        toast.error(j.message ?? "فشل إنشاء الامتحان");
      }
    } catch {
      toast.error("خطأ في الاتصال");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    if (pdfUrl) {
      try {
        URL.revokeObjectURL(pdfUrl);
      } catch {
        /* noop */
      }
    }
    setPdfUrl(null);
    setExamId(null);
    setSettings(DEFAULT_SETTINGS);
    setStep(0);
  };

  // ----------------------------------------------------------------
  // Success screen
  // ----------------------------------------------------------------
  if (pdfUrl && examId) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card className="glass-strong border border-[var(--glass-border)] p-4 sm:p-6">
            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-success/15">
                  <CheckCircle2 className="h-6 w-6 text-success" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">تم إنشاء الامتحان بنجاح!</h2>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono num">{totalCount}</span> سؤال ·{" "}
                    {settings.examTitle}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={generatePdf}
                  disabled={generating}
                  variant="outline"
                  className="glass"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  معاينة وتحميل
                </Button>
                <Button
                  onClick={reset}
                  className="gradient-primary text-white"
                >
                  <RefreshCw className="h-4 w-4" />
                  امتحان جديد
                </Button>
              </div>
            </div>
            <iframe
              src={pdfUrl}
              title="معاينة ملف PDF للامتحان"
              aria-label="معاينة ملف PDF للامتحان"
              className="h-[70vh] w-full rounded-lg border border-[var(--glass-border)] bg-white"
            />
          </Card>
        </motion.div>
      </div>
    );
  }

  // ----------------------------------------------------------------
  // Wizard
  // ----------------------------------------------------------------
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-6"
      >
        <div className="mb-4 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary shadow-lg">
            <Bot className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold">مولّد الامتحانات</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ٥ خطوات لإنشاء امتحان PDF مخصص
          </p>
        </div>

        {/* Stepper */}
        <div className="mb-2 flex items-center justify-between">
          {STEPS.map((s, i) => (
            <div key={i} className="flex flex-1 items-center">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all ${
                  i <= step
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted bg-transparent text-muted-foreground"
                }`}
              >
                {i < step ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <s.icon className="h-4 w-4" />
                )}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-0.5 flex-1 ${
                    i < step ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          {STEPS.map((s, i) => (
            <span key={i} className="flex-1 text-center">
              {s.label}
            </span>
          ))}
        </div>
      </motion.div>

      <Card className="glass border border-[var(--glass-border)] p-6 sm:p-8">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="s0"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-5"
            >
              <div className="space-y-2">
                <Label htmlFor="exam-title">عنوان الامتحان</Label>
                <Input
                  id="exam-title"
                  value={settings.examTitle}
                  onChange={(e) => update("examTitle", e.target.value)}
                  className="glass-input"
                  placeholder="Math Exam 2027"
                  maxLength={30}
                  dir="ltr"
                />
                <p className="text-xs text-muted-foreground">
                  حروف وأرقام إنجليزية ومسافات فقط · ٣-٣٠ حرفاً
                </p>
              </div>
              <div className="space-y-2">
                <Label>عدد الأعمدة في الصفحة</Label>
                <OptionButtons<ColumnsCount>
                  value={settings.columnsCount}
                  onChange={(v) => update("columnsCount", v)}
                  options={[
                    { value: 5, label: "٥ أعمدة" },
                    { value: 10, label: "١٠ أعمدة" },
                  ]}
                />
                <p className="text-xs text-muted-foreground">
                  يتحكم بعرض شبكة الأسئلة في تخطيط الجمع/الطرح والتخيّل
                </p>
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="s1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-5"
            >
              <SectionHeader
                icon={Plus}
                title="قسم الجمع والطرح"
                desc="أسئلة عمليات جمع وطرح أرقام متعددة الخانات"
              />
              <CountSlider
                value={settings.as_questionsCount}
                onChange={(v) => update("as_questionsCount", v)}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <LengthSlider
                  label="عدد الخانات لكل رقم"
                  value={settings.as_numberLength}
                  onChange={(v) => update("as_numberLength", v)}
                  min={1}
                  max={5}
                />
                <LengthSlider
                  label="عدد الحدود"
                  value={settings.as_termsCount}
                  onChange={(v) => update("as_termsCount", v)}
                  min={2}
                  max={10}
                  suffix="حد"
                />
              </div>
              <div className="space-y-2">
                <Label>طريقة الحل</Label>
                <OptionButtons<SolvingMethod>
                  value={settings.as_solvingMethod}
                  onChange={(v) => update("as_solvingMethod", v)}
                  options={SOLVING_METHODS}
                  cols={4}
                />
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="s2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-5"
            >
              <SectionHeader
                icon={X}
                title="قسم الضرب"
                desc="أسئلة ضرب رقمين متعددي الخانات"
              />
              <CountSlider
                value={settings.mul_questionsCount}
                onChange={(v) => update("mul_questionsCount", v)}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <LengthSlider
                  label="خانات الرقم الأول"
                  value={settings.mul_num1Length}
                  onChange={(v) => update("mul_num1Length", v)}
                  min={1}
                  max={3}
                />
                <LengthSlider
                  label="خانات الرقم الثاني"
                  value={settings.mul_num2Length}
                  onChange={(v) => update("mul_num2Length", v)}
                  min={1}
                  max={2}
                />
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="s3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-5"
            >
              <SectionHeader
                icon={Divide}
                title="قسم القسمة"
                desc="أسئلة قسمة أعداد متعددة الخانات"
              />
              <CountSlider
                value={settings.div_questionsCount}
                onChange={(v) => update("div_questionsCount", v)}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <LengthSlider
                  label="خانات المقسوم"
                  value={settings.div_dividendLength}
                  onChange={(v) => update("div_dividendLength", v)}
                  min={2}
                  max={4}
                />
                <LengthSlider
                  label="خانات المقسوم عليه"
                  value={settings.div_divisorLength}
                  onChange={(v) => update("div_divisorLength", v)}
                  min={1}
                  max={4}
                />
              </div>
              <div className="space-y-2">
                <Label>نوع الناتج</Label>
                <OptionButtons<DecimalOption>
                  value={settings.div_decimalOption}
                  onChange={(v) => update("div_decimalOption", v)}
                  options={DECIMAL_OPTIONS}
                />
                {settings.div_decimalOption === "integers" &&
                  settings.div_dividendLength < settings.div_divisorLength && (
                    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      في القسمة الصحيحة: طول المقسوم يجب أن يكون ≥ طول المقسوم عليه
                    </p>
                  )}
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="s4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-5"
            >
              <SectionHeader
                icon={Brain}
                title="قسم الأرقام التخيّلية"
                desc="تدريب على جمع وطرح أرقام تخيّلية متعددة الحدود"
              />
              <CountSlider
                value={settings.im_questionsCount}
                onChange={(v) => update("im_questionsCount", v)}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <LengthSlider
                  label="عدد الخانات لكل رقم"
                  value={settings.im_numberLength}
                  onChange={(v) => update("im_numberLength", v)}
                  min={1}
                  max={5}
                />
                <LengthSlider
                  label="عدد الحدود"
                  value={settings.im_termsCount}
                  onChange={(v) => update("im_termsCount", v)}
                  min={2}
                  max={10}
                  suffix="حد"
                />
              </div>
              <div className="space-y-2">
                <Label>طريقة الحل</Label>
                <OptionButtons<SolvingMethod>
                  value={settings.im_solvingMethod}
                  onChange={(v) => update("im_solvingMethod", v)}
                  options={SOLVING_METHODS}
                  cols={4}
                />
              </div>

              {/* Summary */}
              <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--input)] p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                  <ListChecks className="h-4 w-4 text-primary" />
                  ملخص الامتحان
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                  <SummaryRow
                    label="جمع/طرح"
                    value={settings.as_questionsCount}
                  />
                  <SummaryRow label="ضرب" value={settings.mul_questionsCount} />
                  <SummaryRow label="قسمة" value={settings.div_questionsCount} />
                  <SummaryRow
                    label="تخيّل"
                    value={settings.im_questionsCount}
                  />
                </div>
                <div className="mt-3 border-t border-[var(--glass-border)] pt-3 text-sm">
                  <span className="text-muted-foreground">إجمالي الأسئلة: </span>
                  <span className="font-mono font-bold text-primary num">
                    {totalCount}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer / nav */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--glass-border)] pt-4">
          {step > 0 ? (
            <Button variant="ghost" onClick={prev}>
              <ArrowRight className="h-4 w-4" />
              السابق
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setView("dashboard")}>
              <ArrowRight className="h-4 w-4" />
              اللوحة
            </Button>
          )}
          <div className="flex items-center gap-2">
            {step >= 1 && step <= 4 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={skip}
                className="text-muted-foreground"
              >
                تخطّي هذه الخطوة
              </Button>
            )}
            {step < 4 ? (
              <Button
                onClick={next}
                className="gradient-primary text-white"
              >
                التالي
                <ArrowLeft className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={submit}
                disabled={submitting || totalCount === 0}
                className="gradient-primary text-white"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                إنشاء الامتحان
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

// --------------------------------------------------------------------
// Small helpers local to this view
// --------------------------------------------------------------------

function SectionHeader({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof FileText;
  title: string;
  desc: string;
}): ReactNode {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--glass-border)] bg-[var(--input)] p-3">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg gradient-primary text-white">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h3 className="font-bold">{title}</h3>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-background/40 px-2 py-1">
      <span>{label}</span>
      <span
        className={`font-mono font-bold num ${
          value > 0 ? "text-primary" : "text-muted-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
