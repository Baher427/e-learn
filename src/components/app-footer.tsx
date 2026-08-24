"use client";

/**
 * Sticky footer (pushed down naturally on long content, sticks to
 * bottom on short content thanks to the flex-col layout of <Home/>).
 */
export function AppFooter() {
  return (
    <footer className="mt-auto glass border-t border-[var(--glass-border)]">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 py-6 text-center sm:flex-row sm:justify-between sm:text-right">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="text-lg">🧠</span>
          <span>
            منصة <span className="gradient-text font-bold">e-learn</span> — روّاد الحساب الذهني
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <a
            href="tel:0122147212"
            className="flex items-center gap-1 font-mono hover:text-foreground transition"
            dir="ltr"
          >
            <span>📞</span>
            <span>0122147212</span>
          </a>
          <span>© {new Date().getFullYear()} e-learn. جميع الحقوق محفوظة.</span>
        </div>
      </div>
    </footer>
  );
}
