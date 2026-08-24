"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useRef } from "react";
import type { Question } from "@/lib/game";

interface QuestionDisplayProps {
  question: Question;
  displayMethod: "sequential" | "full";
  displayTime: number; // seconds per term
  disappearTime: number; // seconds gap between terms
  onReady?: () => void; // called when input should be enabled
  questionIndex: number;
  operatorColor?: string; // tailwind class for operators
  accentColor?: string; // tailwind class for the "?" prompt
}

type Phase = "flashing" | "ready";

/**
 * Renders a single Question.
 *
 * - `full`: shows the whole vertical-math block immediately and calls
 *   `onReady` so the parent can enable the keypad.
 * - `sequential`: flashes ONE term at a time for `displayTime` seconds
 *   (a number or operator), with a `disappearTime` second blank gap in
 *   between. After the last term, shows a yellow "?" and calls `onReady`.
 *
 * The component manages its own flashing timeline and notifies the
 * parent via `onReady`. Resetting is driven by the `questionIndex`
 * prop (changing it restarts the timeline).
 */
export function QuestionDisplay({
  question,
  displayMethod,
  displayTime,
  disappearTime,
  onReady,
  questionIndex,
  operatorColor = "text-primary",
  accentColor = "text-warning",
}: QuestionDisplayProps) {
  // For `sequential`: which term (single) is currently visible. `null` = blank.
  const [visibleTerm, setVisibleTerm] = useState<number | string | null>(null);
  const [phase, setPhase] = useState<Phase>("flashing");
  const timeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => {
    // Clear any pending timeouts
    for (const t of timeoutsRef.current) clearTimeout(t);
    timeoutsRef.current = [];

    // Reset to blank flashing state (deferred via setTimeout(0) to avoid
    // the setState-in-effect cascading-render warning).
    const tReset = setTimeout(() => {
      setVisibleTerm(null);
      setPhase("flashing");
    }, 0);
    timeoutsRef.current.push(tReset);

    if (displayMethod === "full") {
      // No flashing — caller enables input after a tiny delay.
      const t = setTimeout(() => {
        setPhase("ready");
        onReady?.();
      }, 50);
      timeoutsRef.current.push(t);
      return;
    }

    // Sequential flashing — one term at a time, blank between.
    let elapsed = 0; // ms
    const total = question.terms.length;

    for (let i = 0; i < total; i++) {
      const term = question.terms[i];
      // Show term i for displayTime seconds
      const t1 = setTimeout(() => setVisibleTerm(term), elapsed);
      timeoutsRef.current.push(t1);
      elapsed += displayTime * 1000;

      // Then blank for disappearTime seconds
      const t2 = setTimeout(() => setVisibleTerm(null), elapsed);
      timeoutsRef.current.push(t2);
      elapsed += disappearTime * 1000;
    }

    // After the last flash, mark ready and call onReady.
    const tReady = setTimeout(() => {
      setVisibleTerm(null);
      setPhase("ready");
      onReady?.();
    }, elapsed);
    timeoutsRef.current.push(tReady);

    return () => {
      for (const t of timeoutsRef.current) clearTimeout(t);
      timeoutsRef.current = [];
    };
  }, [questionIndex, displayMethod, displayTime, disappearTime]);

  const showQuestionMark = phase === "ready";

  // ---- Render ----
  if (displayMethod === "full") {
    // Render the whole vertical math block + question mark
    return (
      <div className="flex min-h-[8rem] flex-col items-center justify-center py-4" dir="ltr">
        <motion.div
          key={`full-${questionIndex}`}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col items-center gap-1 font-mono"
        >
          {question.terms.map((term, i) => {
            if (typeof term === "string") {
              return (
                <span key={i} className={`text-3xl font-bold sm:text-4xl ${operatorColor}`}>
                  {term}
                </span>
              );
            }
            return (
              <span key={i} className="text-4xl font-bold sm:text-5xl">
                {term}
              </span>
            );
          })}
          {showQuestionMark && (
            <span className={`mt-2 text-4xl font-bold sm:text-5xl ${accentColor}`}>؟</span>
          )}
        </motion.div>
      </div>
    );
  }

  // Sequential — show the single currently-flashing term
  return (
    <div className="flex min-h-[8rem] items-center justify-center py-4" dir="ltr">
      <AnimatePresence mode="wait">
        {visibleTerm === null && !showQuestionMark ? (
          <motion.div
            key="blank"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            className="text-muted-foreground"
          >
            …
          </motion.div>
        ) : showQuestionMark ? (
          <motion.span
            key="qmark"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 18 }}
            className={`font-mono text-5xl font-extrabold sm:text-6xl ${accentColor}`}
          >
            ؟
          </motion.span>
        ) : (
          <motion.span
            key={`t-${String(visibleTerm)}-${questionIndex}`}
            initial={{ scale: 0.6, opacity: 0, y: -8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 1.2, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
            className={`font-mono font-extrabold ${
              typeof visibleTerm === "string"
                ? `text-4xl sm:text-5xl ${operatorColor}`
                : "text-5xl sm:text-6xl"
            }`}
          >
            {visibleTerm}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
