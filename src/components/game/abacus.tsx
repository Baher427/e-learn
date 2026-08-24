"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Sparkles, Trophy } from "lucide-react";
import { toast } from "sonner";

export interface AbacusProps {
  rods: number; // 3..13
  mode: "free" | "challenge";
}

interface RodState {
  heaven: boolean; // top bead (value 5) active?
  earth: number; // 0..4 active earth beads
}

const SOROBAN_THEMES = {
  wood: {
    frame: "from-amber-900 to-amber-950",
    beam: "from-amber-700 to-amber-800",
    heavenBead: "from-amber-500 to-amber-700",
    earthBead: "from-amber-300 to-amber-500",
  },
};

const THEME = SOROBAN_THEMES.wood;

export function AbacusGame({ rods, mode }: AbacusProps) {
  const [rodStates, setRodStates] = useState<RodState[]>(
    () => Array.from({ length: rods }, () => ({ heaven: false, earth: 0 }))
  );
  const [challengeTarget, setChallengeTarget] = useState(0);
  const [challengeOptions, setChallengeOptions] = useState<number[]>([]);
  const [challengeScore, setChallengeScore] = useState({ correct: 0, total: 0 });
  const [seedVersion, setSeedVersion] = useState(0); // bump to (re)generate a challenge

  function newChallenge() {
    const max = Math.min(Math.pow(10, Math.min(rods, 6)) - 1, 999_999);
    const target = Math.floor(Math.random() * Math.floor(max * 0.9)) + 5;
    const options = new Set<number>([target]);
    while (options.size < 4) {
      const offset = Math.floor(Math.random() * 11) - 5; // -5..5
      if (offset === 0) continue;
      const val = target + offset;
      if (val >= 0 && val <= max) options.add(val);
    }
    const arr = Array.from(options).sort(() => Math.random() - 0.5);

    setChallengeTarget(target);
    setChallengeOptions(arr);
    setRodStates(valueToRods(target, rods));
  }

  function toggleHeaven(idx: number) {
    if (mode === "challenge") return;
    setRodStates((prev) => prev.map((r, i) => (i === idx ? { ...r, heaven: !r.heaven } : r)));
  }

  function setEarth(idx: number, count: number) {
    if (mode === "challenge") return;
    setRodStates((prev) => prev.map((r, i) => (i === idx ? { ...r, earth: count } : r)));
  }

  function reset() {
    setRodStates(Array.from({ length: rods }, () => ({ heaven: false, earth: 0 })));
  }

  // Auto-generate the first challenge on mount (when in challenge mode).
  // The parent uses a `key` prop to remount this component when rods/mode
  // change, so we only need to handle the very first challenge here.
  useEffect(() => {
    if (mode !== "challenge") return;
    const id = setTimeout(() => newChallenge(), 0);
    return () => clearTimeout(id);
  }, [seedVersion]);

  const grandTotal = useMemo(() => {
    return rodStates.reduce((sum, r, idx) => {
      const power = rods - 1 - idx;
      const rodVal = (r.heaven ? 5 : 0) + r.earth;
      return sum + rodVal * Math.pow(10, power);
    }, 0);
  }, [rodStates, rods]);

  function checkChallengeOption(val: number) {
    const correct = val === challengeTarget;
    setChallengeScore((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
    if (correct) {
      toast.success("إجابة صحيحة! 🎉");
    } else {
      toast.error(`إجابة خاطئة. الصحيح: ${challengeTarget}`);
    }
    // Bump seedVersion to trigger the next challenge via the effect.
    setTimeout(() => setSeedVersion((v) => v + 1), 800);
  }

  return (
    <div dir="rtl" className="flex flex-col items-center gap-4">
      {/* Header display */}
      <Card className="glass w-full border border-[var(--glass-border)] p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="text-sm text-muted-foreground">
              {mode === "free" ? "القيمة الحالية" : "القيمة المعروضة على العدّاد"}
            </span>
          </div>
          <div className="font-mono text-3xl font-bold gradient-text sm:text-4xl" dir="ltr">
            {grandTotal.toLocaleString("en-US")}
          </div>
        </div>
        {mode === "challenge" && (
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--glass-border)] pt-3">
            <Badge variant="secondary" className="glass gap-1">
              <Trophy className="h-3 w-3 text-accent" />
              {challengeScore.correct}/{challengeScore.total}
            </Badge>
            <p className="text-xs text-muted-foreground">
              اضغط على القيمة الصحيحة المطابقة للعدّاد
            </p>
          </div>
        )}
      </Card>

      {/* Soroban frame */}
      <div
        className={`relative w-full max-w-4xl rounded-2xl bg-gradient-to-br ${THEME.frame} p-2 shadow-2xl sm:p-3`}
        style={{
          // bead width sizing
          ["--bead-w" as string]: "calc(min(11vmin, (95vw / " + rods + ") - 1.5vmin))",
        }}
      >
        {/* Inner area */}
        <div className="relative flex gap-1 sm:gap-2" style={{ minHeight: "min(60vh, 360px)" }}>
          {rodStates.map((rs, idx) => (
            <Rod
              key={idx}
              heaven={rs.heaven}
              earth={rs.earth}
              rodIndex={idx}
              rods={rods}
              interactive={mode === "free"}
              onToggleHeaven={() => toggleHeaven(idx)}
              onSetEarth={(n) => setEarth(idx, n)}
            />
          ))}
        </div>

        {/* Reset button */}
        {mode === "free" && (
          <div className="mt-3 flex justify-center">
            <Button variant="outline" size="sm" className="glass gap-1.5" onClick={reset}>
              <RotateCcw className="h-4 w-4" />
              تصفير
            </Button>
          </div>
        )}
      </div>

      {/* Challenge: multiple-choice options */}
      {mode === "challenge" && challengeOptions.length === 4 && (
        <Card className="glass w-full border border-[var(--glass-border)] p-4">
          <p className="mb-3 text-center text-sm text-muted-foreground">اختر القيمة الصحيحة:</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {challengeOptions.map((opt) => (
              <motion.button
                key={opt}
                whileTap={{ scale: 0.94 }}
                whileHover={{ y: -2 }}
                onClick={() => checkChallengeOption(opt)}
                className="glass-input rounded-xl p-4 font-mono text-2xl font-bold transition-colors hover:border-primary/50 hover:text-primary"
                dir="ltr"
              >
                {opt.toLocaleString("en-US")}
              </motion.button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single rod
// ---------------------------------------------------------------------------

interface RodProps {
  heaven: boolean;
  earth: number;
  rodIndex: number;
  rods: number;
  interactive: boolean;
  onToggleHeaven: () => void;
  onSetEarth: (n: number) => void;
}

function Rod({ heaven, earth, rodIndex, rods, interactive, onToggleHeaven, onSetEarth }: RodProps) {
  // Vertical stacking: heaven (1) at top above beam, then 4 earth below.
  // We render heaven + beam + 4 earth beads.
  const power = rods - 1 - rodIndex;
  const digitLabel = (heaven ? 5 : 0) + earth;

  return (
    <div
      className="relative flex flex-col items-center"
      style={{ width: "var(--bead-w)", minWidth: "var(--bead-w)" }}
    >
      {/* Heaven area (top) */}
      <div
        className="flex flex-1 flex-col items-center justify-end pb-1"
        style={{ minHeight: "20%" }}
      >
        <motion.button
          type="button"
          disabled={!interactive}
          onClick={onToggleHeaven}
          animate={{ y: heaven ? 14 : 0 }}
          transition={{ type: "spring", stiffness: 600, damping: 24 }}
          className={`h-1/2 w-full rounded-full bg-gradient-to-br ${THEME.heavenBead} shadow-md ${
            heaven ? "ring-2 ring-amber-300" : "opacity-90"
          } ${interactive ? "cursor-pointer" : "cursor-default"}`}
          style={{ width: "var(--bead-w)" }}
          aria-label={`سلك ${rodIndex + 1} - الخرزة العلوية`}
        />
      </div>

      {/* Beam */}
      <div className={`my-1 h-1.5 w-full rounded bg-gradient-to-r ${THEME.beam} shadow-inner`} />

      {/* Earth beads (bottom) */}
      <div className="flex flex-1 flex-col-reverse items-center pt-1" style={{ minHeight: "40%" }}>
        {[0, 1, 2, 3].map((i) => {
          const active = i < earth;
          return (
            <motion.button
              key={i}
              type="button"
              disabled={!interactive}
              onClick={() => {
                // Clicking bead i: if currently active (i < earth), deactivate beads >= i.
                // If inactive (i >= earth), activate beads 0..i (i+1).
                if (active) {
                  onSetEarth(i);
                } else {
                  onSetEarth(i + 1);
                }
              }}
              animate={{ y: active ? -10 : 0 }}
              transition={{ type: "spring", stiffness: 600, damping: 24 }}
              className={`my-0.5 h-1/2 w-full rounded-full bg-gradient-to-br ${THEME.earthBead} shadow-md ${
                active ? "ring-2 ring-amber-200" : "opacity-95"
              } ${interactive ? "cursor-pointer" : "cursor-default"}`}
              style={{ width: "var(--bead-w)" }}
              aria-label={`سلك ${rodIndex + 1} - خرزة ${i + 1}`}
            />
          );
        })}
      </div>

      {/* Digit label below rod (only in free mode) */}
      {interactive && (
        <div className="mt-1 rounded-md bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-amber-100">
          {digitLabel}
          {power > 0 && <span className="opacity-50">·10^{power}</span>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers: convert a value to a rod configuration (and back)
// ---------------------------------------------------------------------------

function valueToRods(value: number, rods: number): RodState[] {
  const states: RodState[] = [];
  for (let i = 0; i < rods; i++) {
    const power = rods - 1 - i;
    const digit = Math.floor(value / Math.pow(10, power)) % 10;
    states.push({ heaven: digit >= 5, earth: digit % 5 });
  }
  return states;
}
