"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useIsMounted } from "@/lib/hooks/use-is-mounted";

/**
 * Theme toggle. Renders a neutral placeholder until mounted to avoid
 * hydration mismatch (theme is only known on the client).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useIsMounted();
  const isLight = theme === "light";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={mounted && isLight ? "تفعيل الوضع الداكن" : "تبديل السمة"}
      title={mounted ? (isLight ? "الوضع الداكن" : "الوضع الفاتح") : "تبديل السمة"}
      onClick={() => setTheme(isLight ? "dark" : "light")}
      className={`rounded-full glass border border-[var(--glass-border)] backdrop-blur ${className ?? ""}`}
    >
      {mounted ? (
        isLight ? (
          <Moon className="h-4 w-4" />
        ) : (
          <Sun className="h-4 w-4" />
        )
      ) : (
        <div className="h-4 w-4" />
      )}
    </Button>
  );
}
