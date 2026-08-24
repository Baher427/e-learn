"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * Big 3-2-1-Start overlay used right before the game starts.
 * Calls `onComplete` when finished.
 */
export function Countdown({ onComplete }: { onComplete: () => void }) {
  const sequence = ["3", "2", "1", "ابدأ!"];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const stepMs = 700;
    const finalMs = 1100;
    const id = setInterval(() => {
      setIndex((i) => {
        if (i + 1 >= sequence.length) {
          clearInterval(id);
          setTimeout(() => onComplete(), finalMs - stepMs);
          return i;
        }
        return i + 1;
      });
    }, stepMs);
    return () => clearInterval(id);
  }, []);

  const current = sequence[index];
  const isStart = index === sequence.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" dir="rtl">
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ scale: 0.3, opacity: 0, rotate: -15 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 2, opacity: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className={
            isStart
              ? "font-extrabold gradient-text text-5xl sm:text-7xl"
              : "font-mono font-extrabold text-primary text-7xl sm:text-9xl"
          }
        >
          {current}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
