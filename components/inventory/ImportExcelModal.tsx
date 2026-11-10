"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";
import {
  parseInventoryExcelSheet,
  pickInventorySheet,
  type ExcelImportRow,
  type ExcelParseIssue,
} from "@/lib/inventory/excel-import";
import {
  importInventoryExcel,
  type InventoryImportCounts,
} from "@/app/admin/inventory/actions";

interface Props {
  onClose: () => void;
  onImported?: () => void;
}

type Stage = "pick" | "preview" | "done";

export function ImportExcelModal({ onClose, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [stage, setStage] = useState<Stage>("pick");
  const [fileName, setFileName] = useState<string>("");
  const [sheetName, setSheetName] = useState<string>("");
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [sheetMatrices, setSheetMatrices] = useState<
    Array<{ name: string; rows: unknown[][] }>
  >([]);
  const [rows, setRows] = useState<ExcelImportRow[]>([]);
  const [parseIssues, setParseIssues] = useState<ExcelParseIssue[]>([]);
  const [preview, setPreview] = useState<InventoryImportCounts | null>(null);
  const [result, setResult] = useState<InventoryImportCounts | null>(null);
  const [error, setError] = useState<string | null>(null);

  const issuePreview = useMemo(
    () => [...parseIssues, ...(preview?.errors ?? [])].slice(0, 12),
    [parseIssues, preview],
  );

  function applySheet(
    selectedName: string,
    matrices: Array<{ name: string; rows: unknown[][] }>,
    activeFileName: string,
  ) {
    const sheet = pickInventorySheet(matrices, selectedName);
    if (!sheet) {
      setError("No usable sheet found in that workbook.");
      return;
    }
    const parsed = parseInventoryExcelSheet(
      sheet.name,
      sheet.rows,
      matrices.map((m) => m.name),
    );
    setSheetName(parsed.sheetName);
    setAvailableSheets(parsed.availableSheets);
    setRows(parsed.rows);
    setParseIssues(parsed.issues);
    setPreview(null);
    setResult(null);
    setStage("preview");
    setError(null);

    if (parsed.rows.length === 0) {
      setError(parsed.issues[0]?.error ?? "No valid rows found in that sheet.");
      return;
    }

    startTransition(async () => {
      const dry = await importInventoryExcel({
        fileName: activeFileName,
        dryRun: true,
        rows: parsed.rows,
      });
      if (!dry.ok) {
        setError(dry.error);
        return;
      }
      setPreview(dry.counts);
    });
  }

  async function handleFile(file: File) {
    setError(null);
    setPreview(null);
    setResult(null);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
      const matrices = workbook.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
          header: 1,
          defval: null,
          raw: true,
        }) as unknown[][],
      }));
      setSheetMatrices(matrices);
      const picked = pickInventorySheet(matrices);
      applySheet(picked?.name ?? matrices[0]?.name ?? "", matrices, file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to read Excel file");
      setStage("pick");
    }
  }

  function handleConfirm() {
    if (rows.length === 0) return;
    startTransition(async () => {
      const res = await importInventoryExcel({
        fileName,
        dryRun: false,
        rows,
      });
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      setResult(res.counts);
      setStage("done");
      toast.success(
        `Import complete: ${formatNumber(res.counts.updated)} quantities updated`,
      );
      onImported?.();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 px-4 py-10"
      role="dialog"
      aria-modal="true"
      aria-label="Import inventory Excel"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Import Excel</h2>
            <p className="mt-1 text-sm text-slate-500">
              Upload a FULL-style Athens Inventory sheet. Quantities override matching
              locations (SKAPS + Zone + Location + LWhsDesc). Rows missing from the file
              are left unchanged.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {stage === "pick" && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
            <FileSpreadsheet className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-3 text-sm font-medium text-slate-800">
              Choose an .xlsx workbook
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Prefers sheets with SKAPSNo, Quantity, Zone, and Location columns.
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
            <Button
              type="button"
              className="mt-4"
              onClick={() => inputRef.current?.click()}
              disabled={pending}
            >
              <Upload className="h-4 w-4" />
              Browse files
            </Button>
          </div>
        )}

        {(stage === "preview" || stage === "done") && (
          <div className="space-y-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <p>
                <span className="font-medium">File:</span> {fileName || "—"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="font-medium">Sheet:</span>
                {availableSheets.length > 1 ? (
                  <select
                    value={sheetName}
                    disabled={pending || stage === "done"}
                    onChange={(e) => applySheet(e.target.value, sheetMatrices, fileName)}
                    className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs"
                  >
                    {availableSheets.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span>{sheetName}</span>
                )}
                <span className="text-slate-400">
                  {formatNumber(rows.length)} valid rows
                  {parseIssues.length > 0
                    ? ` · ${formatNumber(parseIssues.length)} parse issues`
                    : ""}
                </span>
              </div>
            </div>

            {pending && !preview && stage === "preview" ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Running dry-run preview…
              </div>
            ) : (
              <CountsPanel
                title={stage === "done" ? "Import result" : "Dry-run preview"}
                counts={stage === "done" ? result : preview}
              />
            )}

            {issuePreview.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs font-semibold tracking-wide text-amber-800 uppercase">
                  Issues
                </p>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-amber-900">
                  {issuePreview.map((issue, idx) => (
                    <li key={`${issue.row}-${idx}`}>
                      Row {issue.row}
                      {issue.skaps_number ? ` (${issue.skaps_number})` : ""}: {issue.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              {stage === "preview" && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setStage("pick");
                      setRows([]);
                      setPreview(null);
                      setError(null);
                    }}
                    disabled={pending}
                  >
                    Choose another file
                  </Button>
                  <Button
                    type="button"
                    onClick={handleConfirm}
                    disabled={pending || rows.length === 0}
                  >
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Apply quantity overrides
                  </Button>
                </>
              )}
              {stage === "done" && (
                <Button type="button" onClick={onClose}>
                  Done
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CountsPanel({
  title,
  counts,
}: {
  title: string;
  counts: InventoryImportCounts | null;
}) {
  if (!counts) return null;
  const items: Array<[string, number]> = [
    ["Qty updated", counts.updated],
    ["Unchanged", counts.unchanged],
    ["New locations", counts.new_locations],
    ["New parts", counts.new_parts],
    ["Skipped", counts.skipped],
  ];

  return (
    <div className="rounded-md border border-slate-200 px-3 py-3">
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {items.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] text-slate-400">{label}</dt>
            <dd className="text-lg font-semibold text-slate-900">{formatNumber(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
