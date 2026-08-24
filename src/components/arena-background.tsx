"use client";

/**
 * Animated math-symbol background (ported from the legacy PHP
 * `createBackgroundSymbols()`). Symbols are rendered ONLY on the
 * client after hydration to avoid hydration mismatches caused by
 * server-side style serialization differences (HSL→RGB normalization
 * and float precision). The static gradient container is rendered
 * on the server so there is no layout shift.
 */
import { useEffect, useMemo, useRef } from "react";
import { useIsMounted } from "@/lib/hooks/use-is-mounted";

const SYMBOLS = ["+", "−", "×", "÷", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

type SymbolSpec = {
  char: string;
  left: number;
  top: number;
  size: number;
  rot: number;
  dur: number;
  delay: number;
  color: string;
};

function buildSymbols(count: number): SymbolSpec[] {
  return Array.from({ length: count }, (_, i) => {
    const seed = i + 1;
    const rng = (n: number) => {
      const x = Math.sin(seed * n) * 10000;
      return x - Math.floor(x);
    };
    const hue = Math.floor(rng(1) * 360);
    const lightness = 30 + rng(2) * 40;
    return {
      char: SYMBOLS[Math.floor(rng(3) * SYMBOLS.length)],
      left: rng(4) * 100,
      top: rng(5) * 100,
      size: 1.5 + rng(6) * 2,
      rot: rng(7) * 360,
      dur: 6 + rng(8) * 6,
      delay: -rng(9) * 8,
      color: `hsl(${hue}, 25%, ${lightness}%)`,
    };
  });
}

export function ArenaBackground({ count = 18 }: { count?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const mounted = useIsMounted();

  const symbols = useMemo<SymbolSpec[]>(
    () => (mounted ? buildSymbols(count) : []),
    [count, mounted]
  );

  useEffect(() => {
    if (!ref.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) ref.current.style.setProperty("--anim-duration", "0s");
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at 50% 100%, color-mix(in srgb, var(--card) 80%, transparent) 0%, var(--background) 70%)",
      }}
    >
      {symbols.map((s, i) => (
        <span
          key={i}
          className="bg-symbol"
          style={
            {
              left: `${s.left}%`,
              top: `${s.top}%`,
              fontSize: `${s.size}rem`,
              color: s.color,
              animationDuration: `${s.dur}s`,
              animationDelay: `${s.delay}s`,
              ["--rot" as string]: `${s.rot}deg`,
            } as React.CSSProperties
          }
        >
          {s.char}
        </span>
      ))}
    </div>
  );
}
