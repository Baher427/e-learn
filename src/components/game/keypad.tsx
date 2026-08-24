"use client";

import { motion } from "framer-motion";
import { Delete, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface KeypadProps {
  onNum: (n: string) => void;
  onDelete: () => void;
  onSubmit: () => void;
  disabled?: boolean;
  /** Disable submit button when no input present. */
  submitDisabled?: boolean;
}

/**
 * 4×3 numeric keypad (RTL friendly). Layout matches the legacy
 * games: 1-9 in a 3×3 grid, then ⌫ / 0 / ✓ on the bottom row.
 * Big enough for touch targets (≥56px).
 */
export function GameKeypad({ onNum, onDelete, onSubmit, disabled, submitDisabled }: KeypadProps) {
  const keys = [
    { label: "1", action: () => onNum("1") },
    { label: "2", action: () => onNum("2") },
    { label: "3", action: () => onNum("3") },
    { label: "4", action: () => onNum("4") },
    { label: "5", action: () => onNum("5") },
    { label: "6", action: () => onNum("6") },
    { label: "7", action: () => onNum("7") },
    { label: "8", action: () => onNum("8") },
    { label: "9", action: () => onNum("9") },
  ];

  return (
    <div className="mx-auto grid w-full max-w-sm grid-cols-3 gap-2 sm:gap-3">
      {keys.map((k) => (
        <motion.button
          key={k.label}
          type="button"
          whileTap={{ scale: 0.92 }}
          whileHover={{ y: -2 }}
          disabled={disabled}
          onClick={k.action}
          className={cn(
            "glass-input flex h-14 items-center justify-center rounded-xl font-mono text-2xl font-bold transition-colors sm:h-16 sm:text-3xl",
            "hover:border-primary/50 hover:text-primary",
            "disabled:cursor-not-allowed disabled:opacity-40"
          )}
          aria-label={`رقم ${k.label}`}
        >
          {k.label}
        </motion.button>
      ))}

      <motion.button
        type="button"
        whileTap={{ scale: 0.92 }}
        whileHover={{ y: -2 }}
        disabled={disabled}
        onClick={onDelete}
        className={cn(
          "glass-input flex h-14 items-center justify-center rounded-xl text-destructive transition-colors sm:h-16",
          "hover:border-destructive/50 hover:bg-destructive/10",
          "disabled:cursor-not-allowed disabled:opacity-40"
        )}
        aria-label="حذف"
      >
        <Delete className="h-6 w-6" />
      </motion.button>

      <motion.button
        type="button"
        whileTap={{ scale: 0.92 }}
        whileHover={{ y: -2 }}
        disabled={disabled}
        onClick={() => onNum("0")}
        className={cn(
          "glass-input flex h-14 items-center justify-center rounded-xl font-mono text-2xl font-bold transition-colors sm:h-16 sm:text-3xl",
          "hover:border-primary/50 hover:text-primary",
          "disabled:cursor-not-allowed disabled:opacity-40"
        )}
        aria-label="رقم 0"
      >
        0
      </motion.button>

      <motion.button
        type="button"
        whileTap={{ scale: 0.92 }}
        whileHover={{ y: -2, scale: 1.02 }}
        disabled={disabled || submitDisabled}
        onClick={onSubmit}
        className={cn(
          "gradient-primary flex h-14 items-center justify-center rounded-xl text-white shadow-lg transition-all sm:h-16",
          "hover:shadow-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
        )}
        aria-label="تأكيد الإجابة"
      >
        <Check className="h-7 w-7" />
      </motion.button>
    </div>
  );
}
