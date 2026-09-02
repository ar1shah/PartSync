"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Download, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ExpenseStatusDot } from "@/components/admin/ExpenseStatusDot";
import { PartDetailModal } from "@/components/inventory/PartDetailModal";
import { PartHoverPreview } from "@/components/inventory/PartHoverPreview";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { urgencyTone, normalizeSkapsNumber } from "@/lib/forms/normalize";
import type { InventoryPart } from "@/lib/inventory-backend/types";
import type { Submission } from "@/lib/supabase/types";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

/** "2026-06" -> "June 2026", used both as the group key and the display label. */
function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return MONTH_LABEL_FORMATTER.format(new Date(year, month - 1, 1));
}

interface MonthGroup {
  key: string;
  label: string;
  rows: Submission[];
}

const EXPENSE_STATUS_LABELS: Record<string, string> = {
  expensed: "Expensed out",
  not_expensed: "Not expensed - needs review",
  check_inventory: "Check inventory / stock balance",
  datatex_zero: "Already 0 on Datatex",
  testing: "Test row - not a real expense status",
};

interface Props {
  submissions: Submission[];
  /** "used" or "request" -- controls which columns are shown. */
  formType: "used" | "request";
  /**
   * When true, splits the table into a "This week" section (shown by default)
   * followed by the older rows collapsed into one closed section per month.
   */
  groupByPeriod?: boolean;
  /** New SKAPS inventory, used to resolve a submission's free-text SKAPS number. */
  inventoryParts?: InventoryPart[];
}

export function SubmissionsTable({
  submissions,
  formType,
  groupByPeriod = false,
  inventoryParts,
}: Props) {
  const [query, setQuery] = useState("");
  const [showNeedsReview, setShowNeedsReview] = useState(false);
  const [selectedPart, setSelectedPart] = useState<InventoryPart | null>(null);

  // Normalized skaps# -> part, so recognized rows can link to the master
  // part even though `submissions.skaps_number` is free text with no FK.
  // Ambiguous normalized keys (two parts collapsing to the same key) are
  // dropped rather than guessed at.
  const partsByNormalizedSkaps = useMemo(() => {
    const map = new Map<string, InventoryPart>();
    const seen = new Set<string>();
    for (const part of inventoryParts ?? []) {
      if (!part.skaps_number) continue;
      const key = normalizeSkapsNumber(part.skaps_number);
      if (seen.has(key)) {
        map.delete(key);
        continue;
      }
      seen.add(key);
      map.set(key, part);
    }
    return map;
  }, [inventoryParts]);

  const needsReviewCount = useMemo(
    () => submissions.filter((s) => s.status === "needs_review").length,
    [submissions],
  );

  const filtered = useMemo(() => {
    let list = showNeedsReview
      ? submissions.filter((s) => s.status === "needs_review")
      : submissions;
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((row) => {
      const blob = [
        row.skaps_number,
        row.part_description,
        row.employee_name,
        row.line,
        row.machine_area,
        row.pm_type,
        row.urgency,
        row.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [submissions, query, showNeedsReview]);

  const { thisWeek, byMonth } = useMemo(() => {
    if (!groupByPeriod) return { thisWeek: filtered, byMonth: [] as MonthGroup[] };

    const now = Date.now();
    const thisWeek: Submission[] = [];
    const monthMap = new Map<string, Submission[]>();

    for (const row of filtered) {
      const submitted = row.submitted_at ? new Date(row.submitted_at) : null;
      const isValid = submitted && !Number.isNaN(submitted.getTime());
      if (!isValid || now - submitted.getTime() <= ONE_WEEK_MS) {
        thisWeek.push(row);
        continue;
      }
      const key = monthKey(submitted);
      const bucket = monthMap.get(key);
      if (bucket) bucket.push(row);
      else monthMap.set(key, [row]);
    }

    const byMonth = Array.from(monthMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, rows]) => ({ key, label: monthLabel(key), rows }));

    return { thisWeek, byMonth };
  }, [filtered, groupByPeriod]);

  function downloadCsv() {
    const columns: Array<{ key: keyof Submission; label: string }> =
      formType === "used"
        ? [
            { key: "submitted_at", label: "Submitted" },
            { key: "employee_name", label: "Employee" },
            { key: "skaps_number", label: "SKAPS #" },
            { key: "part_description", label: "Part" },
            { key: "quantity", label: "Quantity" },
            { key: "line", label: "Line" },
            { key: "machine_area", label: "Machine area" },
            { key: "pm_type", label: "PM type" },
            { key: "notes", label: "Notes" },
            { key: "expense_status", label: "Expense status" },
          ]
        : [
            { key: "submitted_at", label: "Submitted" },
            { key: "employee_name", label: "Employee" },
            { key: "skaps_number", label: "SKAPS #" },
            { key: "part_description", label: "Part" },
            { key: "quantity", label: "Quantity" },
            { key: "urgency", label: "Urgency" },
            { key: "line", label: "Line" },
            { key: "machine_area", label: "Machine area" },
            { key: "notes", label: "Notes" },
            { key: "status", label: "Status" },
          ];

    const lines = [columns.map((c) => csvEscape(c.label)).join(",")];
    for (const row of filtered) {
      lines.push(
        columns
          .map((c) => {
            const value = row[c.key];
            if (c.key === "expense_status" && typeof value === "string") {
              return csvEscape(EXPENSE_STATUS_LABELS[value] ?? value);
            }
            return csvEscape(value);
          })
          .join(","),
      );
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${formType}-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function renderTable(rows: Submission[]) {
    if (rows.length === 0) {
      return (
        <Card className="mt-3">
          <CardContent className="py-10 text-center text-sm text-slate-500">
            No submissions match your search.
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="mt-3 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/60 text-left text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">SKAPS #</th>
                <th className="px-4 py-3 text-right font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">Line</th>
                <th className="px-4 py-3 font-medium">Machine</th>
                {formType === "used" ? (
                  <>
                    <th className="px-4 py-3 font-medium">PM type</th>
                    <th className="px-4 py-3 text-center font-medium">Expense</th>
                  </>
                ) : (
                  <th className="px-4 py-3 font-medium">Urgency</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const matchedPart = row.skaps_number
                  ? partsByNormalizedSkaps.get(normalizeSkapsNumber(row.skaps_number))
                  : undefined;

                return (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {formatDateTime(row.submitted_at)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.employee_name ?? "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {matchedPart ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => setSelectedPart(matchedPart)}
                                className="w-fit font-mono text-xs text-blue-700 underline decoration-dotted decoration-from-font underline-offset-2 hover:text-blue-900"
                              >
                                {row.skaps_number}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <PartHoverPreview part={matchedPart} />
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="font-mono text-xs text-slate-700">
                            {row.skaps_number ?? "-"}
                          </span>
                        )}
                        {row.status === "needs_review" && (
                          <Badge tone="warning" className="w-fit text-[10px]">
                            Needs review
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {row.quantity !== null ? formatNumber(row.quantity) : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.line ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{row.machine_area ?? "-"}</td>
                    {formType === "used" ? (
                      <>
                        <td className="px-4 py-3 text-slate-600">{row.pm_type ?? "-"}</td>
                        <td className="px-4 py-3 text-center">
                          <ExpenseStatusDot status={row.expense_status} />
                        </td>
                      </>
                    ) : (
                      <td className="px-4 py-3">
                        {row.urgency ? (
                          <Badge tone={urgencyTone(row.urgency)}>{row.urgency}</Badge>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search SKAPS #, part, employee..."
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            {formType === "used" && needsReviewCount > 0 && (
              <button
                type="button"
                onClick={() => setShowNeedsReview((v) => !v)}
                className={
                  showNeedsReview
                    ? "rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-white"
                    : "rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                }
              >
                Needs review ({needsReviewCount})
              </button>
            )}
            <Button variant="outline" size="sm" onClick={downloadCsv}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Showing {formatNumber(filtered.length)} of {formatNumber(submissions.length)} submissions
        </p>

        {groupByPeriod ? (
          <>
            <div className="mt-4">
              <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                This week
              </h2>
              {renderTable(thisWeek)}
            </div>

            {byMonth.length > 0 && (
              <div className="mt-6 space-y-2">
                <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Earlier
                </h2>
                {byMonth.map((month) => (
                  <MonthSection
                    key={month.key}
                    label={month.label}
                    count={month.rows.length}
                    renderTable={() => renderTable(month.rows)}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          renderTable(filtered)
        )}

        {selectedPart && (
          <PartDetailModal part={selectedPart} onClose={() => setSelectedPart(null)} />
        )}
      </div>
    </TooltipProvider>
  );
}

function MonthSection({
  label,
  count,
  renderTable,
}: {
  label: string;
  count: number;
  renderTable: () => ReactNode;
}) {
  return (
    <details className="group rounded-lg border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50/60 [&::-webkit-details-marker]:hidden">
        <span>{label}</span>
        <span className="flex items-center gap-2 text-xs font-normal text-slate-500">
          {formatNumber(count)} submission{count === 1 ? "" : "s"}
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="border-t border-slate-200 p-3">{renderTable()}</div>
    </details>
  );
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (value instanceof Date) {
    s = value.toISOString();
  }
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
