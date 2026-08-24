/**
 * Single visible route: /. The app is a SPA — all "pages" are
 * components rendered by the <AppShell /> based on the Zustand
 * ui-store's current view. Auth state is fetched via /api/auth/me
 * and gates which views are reachable.
 *
 * Layout (legacy dashboard.php style):
 *   ArenaBackground (fixed) +
 *   sticky glass header (user avatar/name/level + theme toggle +
 *   notification bell + hamburger → opens the user sidebar) +
 *   main (routed view) +
 *   AppSidebar (slide-out drawer with student info) +
 *   sticky footer.
 */
import { ArenaBackground } from "@/components/arena-background";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { AppShell } from "@/components/app-shell";
import { AppFooter } from "@/components/app-footer";

export default function Home() {
  return (
    <div className="relative min-h-screen flex flex-col">
      <ArenaBackground />
      {/* Sticky glass header (legacy style) */}
      <header className="sticky top-0 z-50 w-full border-b border-[var(--glass-border)] bg-[var(--glass)] backdrop-blur-xl">
        <AppHeader />
      </header>

      {/* Main content (routed by AppShell) */}
      <main className="flex-1 w-full">
        <AppShell />
      </main>

      {/* Legacy-style user drawer */}
      <AppSidebar />

      {/* Sticky footer */}
      <AppFooter />
    </div>
  );
}
