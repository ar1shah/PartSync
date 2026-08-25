"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Search } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn, formatDateTime, formatRelativeTime } from "@/lib/utils";
import type { AuditLogEntry } from "@/lib/supabase/types";

const ENTITY_TONE: Record<string, "accent" | "warning" | "danger" | "neutral" | "success"> = {
  submission: "accent",
  part: "success",
  part_in_repair: "warning",
  profile: "neutral",
};

const ENTITY_LABEL: Record<string, string> = {
  submission: "Request",
  part: "Part",
  part_in_repair: "Repair",
  profile: "Account",
};

interface Props {
  entries: AuditLogEntry[];
  avatarByActor: Record<string, string | null>;
}

export function AuditLogClient({ entries, avatarByActor }: Props) {
  const [query, setQuery] = useState("");
  const [actor, setActor] = useState("all");
  const [entityType, setEntityType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const actors = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) if (e.actor_label) set.add(e.actor_label);
    return Array.from(set).sort();
  }, [entries]);

  const entityTypes = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) set.add(e.entity_type);
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fromTime = from ? new Date(from).getTime() : null;
    // Include the whole "to" day by pushing to end-of-day.
    const toTime = to ? new Date(to).getTime() + 24 * 60 * 60 * 1000 : null;

    return entries.filter((e) => {
      if (actor !== "all" && e.actor_label !== actor) return false;
      if (entityType !== "all" && e.entity_type !== entityType) return false;
      const t = new Date(e.created_at).getTime();
      if (fromTime !== null && t < fromTime) return false;
      if (toTime !== null && t >= toTime) return false;
      if (q) {
        const blob = [e.actor_label, e.summary, e.entity_label, e.action]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [entries, query, actor, entityType, from, to]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function downloadCsv() {
    const columns: { key: keyof AuditLogEntry; label: string }[] = [
      { key: "created_at", label: "Timestamp" },
      { key: "actor_label", label: "Actor" },
      { key: "action", label: "Action" },
      { key: "entity_type", label: "Entity type" },
      { key: "entity_label", label: "Entity" },
      { key: "summary", label: "Summary" },
    ];
    const lines = [columns.map((c) => csvEscape(c.label)).join(",")];
    for (const row of filtered) {
      lines.push(columns.map((c) => csvEscape(row[c.key])).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1 lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search actor, summary, action..."
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
          >
            <option value="all">All actors</option>
            {actors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
          >
            <option value="all">All types</option>
            {entityTypes.map((t) => (
              <option key={t} value={t}>
                {ENTITY_LABEL[t] ?? t}
              </option>
            ))}
          </select>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 w-auto"
            aria-label="From date"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 w-auto"
            aria-label="To date"
          />
          <Button variant="outline" size="sm" onClick={downloadCsv}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-slate-500">
              No activity matches your filters.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((e) => {
                  const hasChanges = e.changes && Object.keys(e.changes as object).length > 0;
                  const isOpen = expanded.has(e.id);
                  return (
                    <Fragment key={e.id}>
                      <tr className="align-top">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Avatar
                              name={e.actor_label}
                              src={e.actor_id ? avatarByActor[e.actor_id] : null}
                              size="sm"
                            />
                            <span className="font-medium text-slate-900">
                              {e.actor_label ?? "Unknown"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{e.summary}</td>
                        <td className="px-4 py-3">
                          <Badge tone={ENTITY_TONE[e.entity_type] ?? "neutral"}>
                            {ENTITY_LABEL[e.entity_type] ?? e.entity_type}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                          <span title={formatDateTime(e.created_at)}>
                            {formatRelativeTime(e.created_at)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {hasChanges && (
                            <button
                              type="button"
                              onClick={() => toggle(e.id)}
                              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                            >
                              {isOpen ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                              Details
                            </button>
                          )}
                        </td>
                      </tr>
                      {hasChanges && isOpen && (
                        <tr>
                          <td colSpan={5} className="bg-slate-50 px-4 py-3">
                            <ChangesTable changes={e.changes as Record<string, unknown>} />
                            <p className="mt-2 text-xs text-slate-400">
                              {formatDateTime(e.created_at)}
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ChangesTable({ changes }: { changes: Record<string, unknown> }) {
  const rows = Object.entries(changes);
  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <table className="w-full text-xs">
        <tbody className="divide-y divide-slate-100">
          {rows.map(([field, value]) => {
            const diff = asDiff(value);
            return (
              <tr key={field}>
                <td className="w-40 px-3 py-1.5 font-mono text-slate-500">{field}</td>
                <td className="px-3 py-1.5">
                  {diff ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700 line-through">
                        {renderValue(diff.from)}
                      </span>
                      <span className="text-slate-400">&rarr;</span>
                      <span className="rounded bg-green-50 px-1.5 py-0.5 text-green-700">
                        {renderValue(diff.to)}
                      </span>
                    </span>
                  ) : (
                    <span className={cn("text-slate-700")}>{renderValue(value)}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function asDiff(value: unknown): { from: unknown; to: unknown } | null {
  if (
    value &&
    typeof value === "object" &&
    "from" in value &&
    "to" in value
  ) {
    return value as { from: unknown; to: unknown };
  }
  return null;
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "\u2014";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
