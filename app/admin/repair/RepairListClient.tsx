"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, Pencil, Plus, Search, Trash2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RepairItemForm } from "@/components/repair/RepairItemForm";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import { deleteRepairItem, markAsReturned, updateRepairItem } from "./actions";
import type { PartInRepair } from "@/lib/supabase/types";

type StatusFilter = "in_repair" | "returned" | "all";

interface Props {
  items: PartInRepair[];
  canDelete: boolean;
}

function isOverdue(item: PartInRepair): boolean {
  if (item.status !== "in_repair" || !item.expected_return_at) return false;
  return new Date(item.expected_return_at) < new Date();
}

export function RepairListClient({ items, canDelete }: Props) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("in_repair");
  const [editing, setEditing] = useState<PartInRepair | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (q) {
        const blob = [
          item.skaps_number,
          item.part_name,
          item.repair_vendor,
          item.line,
          item.po_reference,
          item.machine_area,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [items, query, statusFilter]);

  const activeCount = items.filter((i) => i.status === "in_repair").length;
  const overdueCount = items.filter(isOverdue).length;

  function handleMarkReturned(item: PartInRepair) {
    if (!confirm(`Mark "${item.part_name}" as returned?`)) return;
    startTransition(async () => {
      try {
        await markAsReturned(item.id);
        toast.success(`"${item.part_name}" marked as returned`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to mark as returned");
      }
    });
  }

  function handleDelete(item: PartInRepair) {
    if (!confirm(`Delete repair entry for "${item.part_name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      try {
        await deleteRepairItem(item.id);
        toast.success("Entry deleted");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, SKAPS #, vendor, line…"
            className="pl-9"
          />
        </div>
        <Link href="/admin/repair/new">
          <Button size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Add part in repair
          </Button>
        </Link>
      </div>

      {/* Status pills + summary badges */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["in_repair", "Active"],
            ["returned", "Returned"],
            ["all", "All"],
          ] as Array<[StatusFilter, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatusFilter(value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              statusFilter === value
                ? "bg-blue-700 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            {label}
          </button>
        ))}
        {overdueCount > 0 && (
          <Badge tone="warning">
            <AlertTriangle className="mr-1 h-3 w-3" />
            {overdueCount} overdue
          </Badge>
        )}
        <span className="ml-auto text-xs text-slate-500">
          {formatNumber(activeCount)} active
        </span>
      </div>

      <p className="text-xs text-slate-500">
        Showing {formatNumber(filtered.length)} of {formatNumber(items.length)} entries
      </p>

      {/* Table */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            {statusFilter === "in_repair"
              ? "No parts currently in repair."
              : "No entries match your search."}
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Part</th>
                <th className="px-4 py-3 text-left">Qty</th>
                <th className="px-4 py-3 text-left">Sent</th>
                <th className="px-4 py-3 text-left">Exp. return</th>
                <th className="px-4 py-3 text-left">Vendor</th>
                <th className="px-4 py-3 text-left">Line / Area</th>
                <th className="px-4 py-3 text-left">Reason</th>
                <th className="px-4 py-3 text-left">PO ref</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item) => {
                const overdue = isOverdue(item);
                return (
                  <tr key={item.id} className="bg-white hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{item.part_name}</p>
                      {item.skaps_number && (
                        <p className="font-mono text-xs text-slate-500">{item.skaps_number}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatNumber(item.quantity)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDate(item.sent_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {item.expected_return_at ? (
                        <span
                          className={cn(
                            overdue ? "font-medium text-amber-700" : "text-slate-600",
                          )}
                        >
                          {overdue && <AlertTriangle className="mr-1 inline h-3 w-3" />}
                          {formatDate(item.expected_return_at)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.repair_vendor ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {[item.line, item.machine_area].filter(Boolean).join(" / ") || "—"}
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-3 text-slate-600">
                      {item.repair_reason ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {item.po_reference ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {item.status === "in_repair" ? (
                        <Badge tone="accent">In repair</Badge>
                      ) : (
                        <Badge tone="success">
                          Returned{item.returned_at ? ` ${formatDate(item.returned_at)}` : ""}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {item.status === "in_repair" && (
                          <>
                            <button
                              type="button"
                              title="Mark as returned"
                              disabled={pending}
                              onClick={() => handleMarkReturned(item)}
                              className="rounded p-1 text-slate-400 hover:bg-green-50 hover:text-green-700 disabled:opacity-40"
                            >
                              <Undo2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Edit"
                              onClick={() => setEditing(item)}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            title="Delete"
                            disabled={pending}
                            onClick={() => handleDelete(item)}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <EditRepairModal item={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function EditRepairModal({
  item,
  onClose,
}: {
  item: PartInRepair;
  onClose: () => void;
}) {
  const boundAction = updateRepairItem.bind(null, item.id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 px-4 py-10"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Edit repair entry</h2>
            <p className="text-sm text-slate-500">{item.part_name}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
        <RepairItemForm
          action={boundAction}
          initial={item}
          submitLabel="Save changes"
          onSuccess={() => {
            toast.success(`Updated "${item.part_name}"`);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
