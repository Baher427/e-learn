/**
 * Single visible route: /. The app is a SPA — all "pages" are
 * components rendered by the <AppShell /> based on the Zustand
 * ui-store's current view. Auth state is fetched via /api/auth/me
 * and gates which views are reachable.
 *
 * Layout: ArenaBackground (fixed) + sticky header (ThemeToggle + auth
 * state) + main (routed view) + sticky footer.
 */
import { ArenaBackground } from "@/components/arena-background";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppShell } from "@/components/app-shell";
import { AppFooter } from "@/components/app-footer";

export default function Home() {
  return (
    <div className="relative min-h-screen flex flex-col">
      <ArenaBackground />
      {/* Sticky top bar */}
      <header className="sticky top-0 z-50 w-full">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-3 sm:px-6">
          <a
            href="/"
            className="flex items-center gap-2 font-mono font-bold text-sm sm:text-base"
          >
            <span className="text-lg">🧠</span>
            <span className="gradient-text">e-learn</span>
          </a>
          <ThemeToggle />
        </div>
      </header>

      {/* Main content (routed by AppShell) */}
      <main className="flex-1 w-full">
        <AppShell />
      </main>

      {/* Sticky footer */}
      <AppFooter />
    </div>
  );
}
