"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Search,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatNumber } from "@/lib/utils";
import {
  chunkRowsBySkaps,
  parseInventoryExcelSheet,
  pickInventorySheet,
  type ExcelImportRow,
} from "@/lib/inventory/excel-import";
import {
  addCounts,
  DETAIL_FIELD_LABELS,
  EMPTY_COUNTS,
  type ImportCounts,
  type ImportDetailField,
  type ImportDiffRow,
  type ImportUntouchedSummary,
} from "@/lib/inventory/import-types";
import {
  applyImportChunk,
  finishImport,
  previewImportChunk,
  startImport,
  summarizeUntouched,
} from "./actions";

const CHUNK_SIZE = 1000;
const PAGE_SIZE = 50;

type Stage = "pick" | "checking" | "review" | "applying" | "done";
type Filter = "all" | "new_part" | "new_location" | "qty" | "details" | "error";
type SheetMatrix = { name: string; rows: unknown[][]; display: unknown[][] };

interface ApplyOutcome {
  counts: ImportCounts;
  failedChunks: number;
  errors: ImportDiffRow[];
}

function hasQtyChange(row: ImportDiffRow) {
  return row.action === "update" && row.qty_old !== row.qty_new;
}

function hasDetailChange(row: ImportDiffRow) {
  return Object.keys(row.changes ?? {}).length > 0;
}

function matchesFilter(row: ImportDiffRow, filter: Filter) {
  switch (filter) {
    case "all":
      return true;
    case "qty":
      return hasQtyChange(row);
    case "details":
      return hasDetailChange(row);
    default:
      return row.action === filter;
  }
}

export function ImportClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const runId = useRef(0);
  const [stage, setStage] = useState<Stage>("pick");
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<SheetMatrix[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [rows, setRows] = useState<ExcelImportRow[]>([]);
  const [parseErrors, setParseErrors] = useState<ImportDiffRow[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [counts, setCounts] = useState<ImportCounts>(EMPTY_COUNTS);
  const [diff, setDiff] = useState<ImportDiffRow[]>([]);
  const [untouched, setUntouched] = useState<ImportUntouchedSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [outcome, setOutcome] = useState<ApplyOutcome | null>(null);

  const changeCount = counts.new_parts + counts.new_locations + diff.filter((r) => r.action === "update").length;
  const changeWord = changeCount === 1 ? "change" : "changes";

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return diff.filter(
      (row) =>
        matchesFilter(row, filter) &&
        (!q ||
          row.skaps_number?.toLowerCase().includes(q) ||
          row.product_name?.toLowerCase().includes(q)),
    );
  }, [diff, filter, search]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageRows = visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function reset() {
    runId.current += 1;
    setStage("pick");
    setFileName("");
    setSheets([]);
    setRows([]);
    setParseErrors([]);
    setDiff([]);
    setCounts(EMPTY_COUNTS);
    setUntouched(null);
    setError(null);
    setOutcome(null);
    setConfirming(false);
  }

  async function handleFile(file: File) {
    reset();
    setFileName(file.name);
    setStage("checking");
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
      const matrices = workbook.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
          header: 1,
          defval: null,
          raw: true,
        }) as unknown[][],
        display: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
          header: 1,
          defval: null,
          raw: false,
        }) as unknown[][],
      }));
      setSheets(matrices);
      const picked = pickInventorySheet(matrices);
      if (!picked) throw new Error("That workbook has no sheets.");
      await runPreview(matrices, picked.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that Excel file.");
      setStage("pick");
    }
  }

  async function runPreview(matrices: SheetMatrix[], name: string) {
    const id = ++runId.current;
    const sheet = matrices.find((s) => s.name === name);
    if (!sheet) return;

    const parsed = parseInventoryExcelSheet(
      sheet.name,
      sheet.rows,
      matrices.map((s) => s.name),
      sheet.display,
    );
    setSheetName(sheet.name);
    setRows(parsed.rows);
    setStage("checking");
    setError(null);
    setFilter("all");
    setSearch("");
    setPage(0);
    setConfirming(false);

    const parseErrors: ImportDiffRow[] = parsed.issues.map((issue) => ({
      row: issue.row,
      skaps_number: issue.skaps_number,
      action: "error",
      error: issue.error,
    }));
    setParseErrors(parseErrors);

    if (parsed.rows.length === 0) {
      setDiff(parseErrors);
      setCounts({ ...EMPTY_COUNTS, errors: parseErrors.length });
      setUntouched(null);
      setError(parsed.issues[0]?.error ?? "No usable rows found on that sheet.");
      setStage("review");
      return;
    }

    const chunks = chunkRowsBySkaps(parsed.rows, CHUNK_SIZE);
    setProgress({ done: 0, total: chunks.length });
    let total = { ...EMPTY_COUNTS, errors: parseErrors.length };
    const collected: ImportDiffRow[] = [...parseErrors];

    for (let i = 0; i < chunks.length; i++) {
      const res = await previewImportChunk(chunks[i]);
      if (id !== runId.current) return;
      if (!res.ok) {
        setError(`Preview failed: ${res.error}`);
        setStage("pick");
        return;
      }
      total = addCounts(total, res.counts);
      collected.push(...res.rows);
      setProgress({ done: i + 1, total: chunks.length });
    }

    const keys = parsed.rows.map((r) => [r.skaps_number, r.zone, r.location_code, r.warehouse_description]);
    const summary = await summarizeUntouched(keys);
    if (id !== runId.current) return;

    collected.sort((a, b) => a.row - b.row);
    setDiff(collected);
    setCounts(total);
    setUntouched(summary.ok ? summary.summary : null);
    setStage("review");
  }

  async function apply() {
    setConfirming(false);
    setStage("applying");
    setError(null);

    const started = await startImport({ fileName, sheetName, totalRows: rows.length });
    if (!started.ok) {
      setError(started.error);
      setStage("review");
      return;
    }

    const chunks = chunkRowsBySkaps(rows, CHUNK_SIZE);
    setProgress({ done: 0, total: chunks.length });
    let total = { ...EMPTY_COUNTS, errors: parseErrors.length };
    let failedChunks = 0;
    const errors: ImportDiffRow[] = [...parseErrors];

    for (let i = 0; i < chunks.length; i++) {
      const res = await applyImportChunk({ batchId: started.batchId, fileName, rows: chunks[i] });
      if (res.ok) {
        total = addCounts(total, res.counts);
        errors.push(...res.rows.filter((r) => r.action === "error"));
      } else {
        failedChunks += 1;
        errors.push({
          row: chunks[i][0]?.row_number ?? 0,
          skaps_number: null,
          action: "error",
          error: `${chunks[i].length} rows were not applied: ${res.error}`,
        });
      }
      setProgress({ done: i + 1, total: chunks.length });
    }

    await finishImport({ batchId: started.batchId, fileName, sheetName, counts: total, failedChunks });
    setOutcome({ counts: total, failedChunks, errors });
    setStage("done");
    if (failedChunks > 0 || total.errors > 0) toast.warning("Import finished with some problems");
    else toast.success("Inventory updated from Excel");
  }

  if (stage === "pick") {
    return (
      <div className="space-y-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          className={cn(
            "rounded-lg border-2 border-dashed px-6 py-14 text-center transition-colors",
            dragging ? "border-blue-400 bg-blue-50" : "border-slate-300 bg-white",
          )}
        >
          <FileSpreadsheet className="mx-auto h-10 w-10 text-slate-400" />
          <p className="mt-3 text-sm font-medium text-slate-800">
            Drop the Athens Inventory workbook here
          </p>
          <p className="mt-1 text-xs text-slate-500">
            .xlsx with SKAPSNo, Quantity, Zone, Location and LWhsDesc columns (the FULL sheet).
            Nothing changes until you review and apply.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
          <Button type="button" className="mt-5" onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4" />
            Choose file
          </Button>
        </div>
        {error && <ErrorNote message={error} />}
      </div>
    );
  }

  if (stage === "checking" || stage === "applying") {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
        <p className="mt-3 text-sm font-medium text-slate-800">
          {stage === "checking"
            ? "Comparing the sheet with current inventory…"
            : "Applying changes to inventory…"}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {fileName}
          {sheetName ? ` · ${sheetName}` : ""}
          {rows.length ? ` · ${formatNumber(rows.length)} rows` : ""}
        </p>
        <div className="mx-auto mt-5 h-2 max-w-sm overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-slate-400">{pct}%</p>
        {stage === "applying" && (
          <p className="mt-3 text-xs text-amber-700">Keep this tab open until it finishes.</p>
        )}
      </div>
    );
  }

  if (stage === "done" && outcome) {
    const c = outcome.counts;
    const problems = outcome.failedChunks > 0 || outcome.errors.length > 0;
    return (
      <div className="space-y-4">
        <div
          className={cn(
            "rounded-lg border px-5 py-4",
            problems ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50",
          )}
        >
          <div className="flex items-center gap-2">
            {problems ? (
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            )}
            <p className="font-medium text-slate-900">
              {problems ? "Import finished with some problems" : "Import complete"}
            </p>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {formatNumber(c.new_parts)} new parts · {formatNumber(c.new_locations)} new bins ·{" "}
            {formatNumber(c.qty_changes)} qty changes · {formatNumber(c.detail_changes)} detail
            changes · {formatNumber(c.unchanged)} unchanged
          </p>
        </div>
        {outcome.errors.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-white">
            <p className="border-b border-red-100 px-4 py-2 text-xs font-semibold tracking-wide text-red-700 uppercase">
              Not applied ({formatNumber(outcome.errors.length)})
            </p>
            <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto text-sm">
              {outcome.errors.map((e, i) => (
                <li key={`${e.row}-${i}`} className="px-4 py-2 text-slate-700">
                  Row {e.row}
                  {e.skaps_number ? ` · ${e.skaps_number}` : ""}: {e.error}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/admin/inventory">View inventory</Link>
          </Button>
          <Button type="button" variant="outline" onClick={reset}>
            Import another file
          </Button>
        </div>
      </div>
    );
  }

  const cards: Array<{ key: Filter | null; label: string; value: number; tone: string }> = [
    { key: "new_part", label: "New parts", value: counts.new_parts, tone: "text-green-700" },
    { key: "new_location", label: "New bins", value: counts.new_locations, tone: "text-blue-700" },
    { key: "qty", label: "Qty changes", value: counts.qty_changes, tone: "text-amber-700" },
    { key: "details", label: "Detail changes", value: counts.detail_changes, tone: "text-violet-700" },
    { key: null, label: "Unchanged", value: counts.unchanged, tone: "text-slate-500" },
    { key: "error", label: "Issues", value: counts.errors, tone: "text-red-700" },
  ];

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
          <FileSpreadsheet className="h-4 w-4 text-slate-400" />
          {fileName}
        </span>
        <label className="inline-flex items-center gap-2 text-slate-600">
          Sheet
          <select
            value={sheetName}
            onChange={(e) => void runPreview(sheets, e.target.value)}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm"
          >
            {sheets.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} ({formatNumber(Math.max(0, s.rows.length - 1))} rows)
              </option>
            ))}
          </select>
        </label>
        <span className="text-slate-400">{formatNumber(rows.length)} valid rows</span>
        <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={reset}>
          Choose another file
        </Button>
      </div>

      {error && <ErrorNote message={error} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => {
          const active = card.key !== null && filter === card.key;
          return (
            <button
              key={card.label}
              type="button"
              disabled={card.key === null}
              onClick={() => {
                if (card.key === null) return;
                setFilter(active ? "all" : card.key);
                setPage(0);
              }}
              className={cn(
                "rounded-lg border bg-white px-4 py-3 text-left transition-colors",
                card.key !== null && "hover:border-slate-300",
                active ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200",
              )}
            >
              <p className="text-xs text-slate-500">{card.label}</p>
              <p className={cn("mt-1 text-2xl font-semibold", card.tone)}>
                {formatNumber(card.value)}
              </p>
            </button>
          );
        })}
      </div>

      {untouched && (untouched.parts_not_in_sheet > 0 || untouched.bins_not_in_sheet > 0) && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <span className="font-medium text-slate-800">Left as-is:</span>{" "}
          {formatNumber(untouched.parts_not_in_sheet)}{" "}
          {untouched.parts_not_in_sheet === 1 ? "part that isn't" : "parts that aren't"} on this
          sheet
          {untouched.bins_not_in_sheet > 0 && (
            <>
              , and {formatNumber(untouched.bins_not_in_sheet)}{" "}
              {untouched.bins_not_in_sheet === 1 ? "bin" : "bins"} of listed parts that the sheet
              doesn&apos;t mention (holding {formatNumber(untouched.bins_not_in_sheet_qty)} in
              total)
            </>
          )}
          . Nothing is removed.
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search SKAPS or name"
              className="h-8 w-56 rounded-md border border-slate-200 pr-2 pl-8 text-sm"
            />
          </div>
          {filter !== "all" && (
            <button
              type="button"
              onClick={() => setFilter("all")}
              className="text-xs text-blue-700 hover:underline"
            >
              Show all changes
            </button>
          )}
          <span className="ml-auto text-xs text-slate-400">
            {formatNumber(visible.length)} rows
          </span>
        </div>

        {visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            {diff.length === 0
              ? "Everything on this sheet already matches the inventory."
              : "No rows match this filter."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="px-4 py-2 font-medium">Row</th>
                  <th className="px-4 py-2 font-medium">Part</th>
                  <th className="px-4 py-2 font-medium">Bin</th>
                  <th className="px-4 py-2 font-medium">Qty</th>
                  <th className="px-4 py-2 font-medium">Other changes</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.map((row, i) => (
                  <DiffRow key={`${row.row}-${row.action}-${i}`} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            <span>
              Page {page + 1} of {pageCount}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= pageCount - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur lg:left-60">
        <div className="flex flex-wrap items-center justify-end gap-3 px-4 py-3 sm:px-8">
          {confirming ? (
            <>
              <span className="mr-auto text-sm text-slate-700">
                This updates the live inventory for everyone. Apply{" "}
                <strong>{formatNumber(changeCount)}</strong> {changeWord}?
              </span>
              <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void apply()}>
                Yes, apply
              </Button>
            </>
          ) : (
            <>
              <span className="mr-auto text-sm text-slate-500">
                {changeCount === 0
                  ? "Nothing to apply."
                  : `${formatNumber(changeCount)} ${changeWord} ready. Rows with issues are skipped.`}
              </span>
              <Button type="button" disabled={changeCount === 0} onClick={() => setConfirming(true)}>
                Apply {formatNumber(changeCount)} {changeWord}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
      {message}
    </p>
  );
}

const STATUS: Record<ImportDiffRow["action"], { label: string; tone: "success" | "accent" | "warning" | "danger" }> = {
  new_part: { label: "New part", tone: "success" },
  new_location: { label: "New bin", tone: "accent" },
  update: { label: "Update", tone: "warning" },
  error: { label: "Issue", tone: "danger" },
};

function DiffRow({ row }: { row: ImportDiffRow }) {
  const status = STATUS[row.action];
  const changes = Object.entries(row.changes ?? {}) as Array<
    [ImportDetailField, { old: string | null; new: string | null }]
  >;

  if (row.action === "error") {
    return (
      <tr className="bg-red-50/40 align-top">
        <td className="px-4 py-2.5 text-slate-500 tabular-nums">{row.row}</td>
        <td className="px-4 py-2.5 font-mono text-xs text-slate-800">{row.skaps_number ?? "—"}</td>
        <td colSpan={3} className="px-4 py-2.5 text-red-700">
          {row.error}
        </td>
        <td className="px-4 py-2.5">
          <Badge tone={status.tone}>{status.label}</Badge>
        </td>
      </tr>
    );
  }

  const bin = [row.zone, row.location_code].filter(Boolean).join(" · ") || "—";
  const delta = row.qty_old != null && row.qty_new != null ? row.qty_new - row.qty_old : null;

  return (
    <tr className="align-top">
      <td className="px-4 py-2.5 text-slate-500 tabular-nums">{row.row}</td>
      <td className="max-w-64 px-4 py-2.5">
        <p className="font-mono text-xs font-medium text-slate-900">{row.skaps_number}</p>
        {row.product_name && row.product_name !== row.skaps_number && (
          <p className="truncate text-xs text-slate-500" title={row.product_name}>
            {row.product_name}
          </p>
        )}
      </td>
      <td className="px-4 py-2.5">
        <p className="text-slate-800">{bin}</p>
        {row.warehouse && <p className="text-xs text-slate-500">{row.warehouse}</p>}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
        {row.qty_old == null ? (
          <span className="font-medium text-green-700">{formatNumber(row.qty_new)}</span>
        ) : row.qty_old === row.qty_new ? (
          <span className="text-slate-500">{formatNumber(row.qty_new)}</span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <span className="text-slate-400 line-through">{formatNumber(row.qty_old)}</span>
            <ArrowRight className="h-3 w-3 text-slate-400" />
            <span className="font-medium text-slate-900">{formatNumber(row.qty_new)}</span>
            {delta !== null && (
              <span
                className={cn(
                  "rounded px-1 text-xs font-medium",
                  delta > 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700",
                )}
              >
                {delta > 0 ? "+" : ""}
                {formatNumber(Number(delta.toFixed(3)))}
              </span>
            )}
          </span>
        )}
      </td>
      <td className="max-w-md px-4 py-2.5">
        {changes.length === 0 ? (
          <span className="text-slate-300">—</span>
        ) : (
          <ul className="space-y-1">
            {changes.map(([field, change]) => (
              <li key={field} className="text-xs">
                <span className="font-medium text-slate-600">{DETAIL_FIELD_LABELS[field]}:</span>{" "}
                <span className="text-red-600 line-through" title={change.old ?? ""}>
                  {change.old || "(empty)"}
                </span>{" "}
                <span className="text-slate-400">→</span>{" "}
                <span className="text-green-700" title={change.new ?? ""}>
                  {change.new}
                </span>
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className="px-4 py-2.5">
        <Badge tone={status.tone}>{status.label}</Badge>
      </td>
    </tr>
  );
}
