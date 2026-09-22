/** Shared pulse block used by admin loading skeletons. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/80 ${className ?? ""}`} />;
}

/** Page-header + content placeholder for admin list routes. */
export function AdminPageSkeleton({
  rows = 8,
  titleWidth = "w-48",
}: {
  rows?: number;
  titleWidth?: string;
}) {
  return (
    <div aria-busy="true" aria-live="polite">
      <SkeletonBlock className={`h-8 ${titleWidth}`} />
      <SkeletonBlock className="mt-2 h-4 w-72 max-w-full" />
      <div className="mt-8 space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <SkeletonBlock key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

/** Compact card placeholder for dashboard widgets streaming in. */
export function WidgetSkeleton({ tall = false }: { tall?: boolean }) {
  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white p-5 ${tall ? "min-h-80" : "min-h-36"}`}
      aria-busy="true"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-2">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="h-3 w-40" />
        </div>
        <SkeletonBlock className="h-8 w-8 rounded-md" />
      </div>
      <SkeletonBlock className={`mt-4 w-full ${tall ? "h-56" : "h-16"}`} />
    </div>
  );
}
