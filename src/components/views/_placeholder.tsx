"use client";

import { Loader2, Construction } from "lucide-react";
import { useUIStore, ViewId } from "@/lib/ui-store";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

/** Temporary placeholder for views not yet built. */
export function PlaceholderView({ name }: { name: string }) {
  const setView = useUIStore((s) => s.setView);
  return (
    <div className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col items-center justify-center px-4 text-center">
      <Construction className="mb-4 h-12 w-12 text-warning" />
      <h2 className="mb-2 text-xl font-bold">{name}</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        هذه الواجهة قيد الإنشاء وستُضاف قريباً في نسخة 2027.
      </p>
      <Button variant="outline" onClick={() => setView("dashboard")}>
        <ArrowRight className="h-4 w-4" />
        العودة للوحة التحكم
      </Button>
    </div>
  );
}

export function LoadingView() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}
