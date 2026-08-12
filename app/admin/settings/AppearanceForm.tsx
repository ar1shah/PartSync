"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowUpRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BACKGROUND_PRESETS } from "@/lib/dashboard/backgrounds";
import { updateAppearance } from "./actions";

type Density = "comfortable" | "compact";

export function AppearanceForm({
  initialBackground,
  initialDensity,
}: {
  initialBackground: string;
  initialDensity: Density;
}) {
  const [background, setBackground] = useState(initialBackground);
  const [density, setDensity] = useState<Density>(initialDensity);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const res = await updateAppearance({ background, density });
      if (res.ok) toast.success("Appearance updated");
      else toast.error(res.error ?? "Failed to update appearance");
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-slate-900">Background</p>
        <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {BACKGROUND_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setBackground(preset.id)}
              className={cn(
                "group relative flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors",
                background === preset.id
                  ? "border-blue-500 ring-2 ring-blue-200"
                  : "border-slate-200 hover:border-slate-300",
              )}
            >
              <span
                className={cn(
                  "flex h-10 w-full items-center justify-center rounded-md border border-slate-200",
                  preset.swatchClassName,
                )}
              >
                {background === preset.id && (
                  <Check className="h-4 w-4 text-blue-700" />
                )}
              </span>
              <span className="text-xs text-slate-600">{preset.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-slate-900">Density</p>
        <div className="mt-2 flex gap-2">
          {(["comfortable", "compact"] as Density[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDensity(value)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium capitalize transition-colors",
                density === value
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
        >
          Rearrange widgets on the dashboard
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
        <Button onClick={handleSave} disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save appearance"
          )}
        </Button>
      </div>
    </div>
  );
}
