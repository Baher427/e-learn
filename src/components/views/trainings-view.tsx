"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useUIStore, ViewId } from "@/lib/ui-store";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  X,
  Divide,
  Calculator,
  ArrowRight,
  Clock,
  Hash,
  Eye,
  Zap,
  Brain,
} from "lucide-react";
import { toast } from "sonner";

type GameKind = "add-sub" | "mult" | "div" | "abacus";

type SolvingMethod = "direct" | "friendsOf5" | "friendsOf10";

const GAME_KINDS: readonly GameKind[] = ["add-sub", "mult", "div", "abacus"];

function isGameKind(v: string | undefined): v is GameKind {
  return !!v && (GAME_KINDS as readonly string[]).includes(v);
}

interface SetupConfig {
  // add/sub
  numberLength?: number; // 1..4
  termsCount?: number; // 2..20
  solvingMethod?: SolvingMethod; // direct | friendsOf5 | friendsOf10
  // mult
  num1Length?: number; // 1..4
  num2Length?: number; // 1..3
  // div
  dividendLength?: number; // 2..4
  divisorLength?: number; // 1..2
  // shared
  displayTime?: number; // 0.1..10 seconds
  disappearTime?: number; // 0.1..10 seconds
  displayMethod?: "sequential" | "full";
  // abacus
  rods?: number; // 3..13
  abacusMode?: "free" | "challenge";
}

const GAME_CARDS: Array<{
  kind: GameKind;
  title: string;
  desc: string;
  icon: typeof Plus;
  gradient: string;
  view: ViewId;
}> = [
  {
    kind: "add-sub",
    title: "الجمع والطرح",
    desc: "تدريب على العمليات الحسابية الأساسية بسرعة ذهنية",
    icon: Plus,
    gradient: "from-emerald-500 to-teal-600",
    view: "game-add-sub",
  },
  {
    kind: "mult",
    title: "الضرب",
    desc: "احترف جدول الضرب بأرقام متعددة الخانات",
    icon: X,
    gradient: "from-orange-500 to-red-600",
    view: "game-mult",
  },
  {
    kind: "div",
    title: "القسمة",
    desc: "قسّم أرقاماً كبيرة بثقة وسرعة",
    icon: Divide,
    gradient: "from-cyan-500 to-blue-600",
    view: "game-div",
  },
  {
    kind: "abacus",
    title: "الأباكوس (سوروبان)",
    desc: "تدريب على العدّاد الياباني لتنمية الإدراك البصري",
    icon: Calculator,
    gradient: "from-violet-500 to-purple-600",
    view: "game-abacus",
  },
];

export function TrainingsView() {
  const setView = useUIStore((s) => s.setView);
  const params = useUIStore((s) => s.params);
  const [selected, setSelected] = useState<GameKind | null>(null);

  // "Adjust state during render" pattern (per React docs) — when the
  // dashboard navigates here via setView("trainings", { game: "…" }),
  // pre-select that game so its setup dialog opens automatically.
  // (Avoids setState-in-effect; the lastPreselect guard makes it run once.)
  const [lastPreselect, setLastPreselect] = useState<GameKind | null>(null);
  const preselectKey = isGameKind(params.game) ? params.game : null;
  if (preselectKey && preselectKey !== lastPreselect) {
    setLastPreselect(preselectKey);
    setSelected(preselectKey);
  }

  const [cfg, setCfg] = useState<SetupConfig>({
    numberLength: 1,
    termsCount: 2,
    solvingMethod: "direct",
    num1Length: 2,
    num2Length: 1,
    dividendLength: 3,
    divisorLength: 1,
    displayTime: 1.5,
    disappearTime: 0.5,
    displayMethod: "sequential",
    rods: 5,
    abacusMode: "free",
  });

  const startGame = () => {
    if (!selected) return;
    const card = GAME_CARDS.find((c) => c.kind === selected)!;
    const seed = nanoid(16);

    // Build a flat params object for the view store (values must be strings)
    const params: Record<string, string> = {
      seed,
      ...Object.fromEntries(
        Object.entries(cfg).map(([k, v]) => [k, String(v)])
      ),
    };

    setView(card.view, params);
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8" dir="rtl">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <Button variant="ghost" size="sm" className="mb-3" onClick={() => setView("dashboard")}>
          <ArrowRight className="h-4 w-4" />
          لوحة التحكم
        </Button>
        <div className="text-center sm:text-right">
          <h1 className="flex items-center justify-center gap-2 text-2xl font-bold sm:text-3xl">
            <Zap className="h-7 w-7 text-primary" />
            منطقة التدريب
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            اختر نوع التدريب، اضبط المستوى، وابدأ رحلتك في الحساب الذهني.
          </p>
        </div>
      </motion.div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {GAME_CARDS.map((c, i) => (
          <motion.div
            key={c.kind}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
          >
            <Card
              className="glass h-full cursor-pointer border border-[var(--glass-border)] p-5 transition-all hover:scale-[1.02] hover:border-primary/40"
              onClick={() => setSelected(c.kind)}
            >
              <div className={`mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${c.gradient} text-white shadow-lg`}>
                <c.icon className="h-7 w-7" />
              </div>
              <h3 className="mb-1 font-bold">{c.title}</h3>
              <p className="text-xs text-muted-foreground">{c.desc}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Setup dialog */}
      <SetupDialog
        selected={selected}
        cfg={cfg}
        setCfg={setCfg}
        onClose={() => setSelected(null)}
        onStart={startGame}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup dialog with per-game settings
// ---------------------------------------------------------------------------

interface SetupDialogProps {
  selected: GameKind | null;
  cfg: SetupConfig;
  setCfg: (updater: (prev: SetupConfig) => SetupConfig) => void;
  onClose: () => void;
  onStart: () => void;
}

function SetupDialog({ selected, cfg, setCfg, onClose, onStart }: SetupDialogProps) {
  const card = GAME_CARDS.find((c) => c.kind === selected);
  const open = !!selected;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-strong max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className={`mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${card?.gradient} text-white shadow-lg`}>
            {card && <card.icon className="h-7 w-7" />}
          </div>
          <DialogTitle className="text-center text-xl">{card?.title}</DialogTitle>
          <DialogDescription className="text-center">اضبط إعدادات التدريب ثم اضغط «ابدأ».</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {selected === "add-sub" && (
            <>
              <SliderField
                label="عدد الخانات"
                icon={<Hash className="h-3.5 w-3.5" />}
                value={cfg.numberLength ?? 1}
                min={1}
                max={4}
                step={1}
                labels={["1 خانة", "2", "3", "4"]}
                onChange={(v) => setCfg((p) => ({ ...p, numberLength: v }))}
              />
              <SliderField
                label="عدد الحدود"
                icon={<Hash className="h-3.5 w-3.5" />}
                value={cfg.termsCount ?? 2}
                min={2}
                max={20}
                step={1}
                onChange={(v) => setCfg((p) => ({ ...p, termsCount: v }))}
              />
              <SelectField
                label="طريقة الحل"
                icon={<Brain className="h-3.5 w-3.5" />}
                value={cfg.solvingMethod ?? "direct"}
                onChange={(v) => setCfg((p) => ({ ...p, solvingMethod: v as SolvingMethod }))}
                options={[
                  { value: "direct", label: "مباشرة — أرقام عشوائية" },
                  { value: "friendsOf5", label: "أصدقاء الخمسة (1+4، 2+3)" },
                  { value: "friendsOf10", label: "أصدقاء العشرة (1+9، 2+8…)" },
                ]}
              />
            </>
          )}

          {selected === "mult" && (
            <>
              <SliderField
                label="عدد خانات الرقم الأول"
                icon={<Hash className="h-3.5 w-3.5" />}
                value={cfg.num1Length ?? 2}
                min={1}
                max={4}
                step={1}
                onChange={(v) => setCfg((p) => ({ ...p, num1Length: v }))}
              />
              <SliderField
                label="عدد خانات الرقم الثاني"
                icon={<Hash className="h-3.5 w-3.5" />}
                value={cfg.num2Length ?? 1}
                min={1}
                max={3}
                step={1}
                onChange={(v) => setCfg((p) => ({ ...p, num2Length: v }))}
              />
            </>
          )}

          {selected === "div" && (
            <>
              <SliderField
                label="عدد خانات المقسوم"
                icon={<Hash className="h-3.5 w-3.5" />}
                value={cfg.dividendLength ?? 3}
                min={2}
                max={4}
                step={1}
                onChange={(v) => setCfg((p) => ({ ...p, dividendLength: v }))}
              />
              <SliderField
                label="عدد خانات القاسم"
                icon={<Hash className="h-3.5 w-3.5" />}
                value={cfg.divisorLength ?? 1}
                min={1}
                max={2}
                step={1}
                onChange={(v) => setCfg((p) => ({ ...p, divisorLength: v }))}
              />
            </>
          )}

          {selected === "abacus" && (
            <>
              <SliderField
                label="عدد الأسلاك"
                icon={<Hash className="h-3.5 w-3.5" />}
                value={cfg.rods ?? 5}
                min={3}
                max={13}
                step={1}
                onChange={(v) => setCfg((p) => ({ ...p, rods: v }))}
              />
              <SelectField
                label="الوضع"
                icon={<Eye className="h-3.5 w-3.5" />}
                value={cfg.abacusMode ?? "free"}
                onChange={(v) => setCfg((p) => ({ ...p, abacusMode: v as "free" | "challenge" }))}
                options={[
                  { value: "free", label: "حر — عدّ واستكشف" },
                  { value: "challenge", label: "تحدّي — اختر الإجابة الصحيحة" },
                ]}
              />
            </>
          )}

          {selected !== "abacus" && (
            <>
              <SelectField
                label="طريقة العرض"
                icon={<Eye className="h-3.5 w-3.5" />}
                value={cfg.displayMethod ?? "sequential"}
                onChange={(v) => setCfg((p) => ({ ...p, displayMethod: v as "sequential" | "full" }))}
                options={[
                  { value: "sequential", label: "متسلسل (أرقام متتابعة)" },
                  { value: "full", label: "كامل (المسألة كاملة)" },
                ]}
              />
              <SliderField
                label="زمن العرض (ث)"
                icon={<Clock className="h-3.5 w-3.5" />}
                value={cfg.displayTime ?? 1.5}
                min={0.3}
                max={5}
                step={0.1}
                decimals={1}
                onChange={(v) => setCfg((p) => ({ ...p, displayTime: v }))}
              />
              <SliderField
                label="زمن الاختفاء (ث)"
                icon={<Clock className="h-3.5 w-3.5" />}
                value={cfg.disappearTime ?? 0.5}
                min={0.1}
                max={3}
                step={0.1}
                decimals={1}
                onChange={(v) => setCfg((p) => ({ ...p, disappearTime: v }))}
              />
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button
            className="gradient-primary text-white"
            onClick={() => {
              onStart();
              toast.success("هيا بنا! استعدّ للعد التنازلي…");
            }}
          >
            <Zap className="h-4 w-4" />
            ابدأ التدريب
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

function SliderField({
  label,
  icon,
  value,
  min,
  max,
  step,
  decimals = 0,
  labels,
  onChange,
}: {
  label: string;
  icon?: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  labels?: string[];
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          {icon}
          {label}
        </Label>
        <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-sm font-bold text-primary">
          {value.toFixed(decimals)}
          {labels ? ` (${labels[value - min]})` : ""}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(arr) => onChange(arr[0])}
      />
    </div>
  );
}

function SelectField({
  label,
  icon,
  value,
  onChange,
  options,
}: {
  label: string;
  icon?: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        {icon}
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="glass-input w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
