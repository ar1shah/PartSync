export interface FieldBreakdown {
  label: string;
  count: number;
  quantity: number;
}

type AggregateField = "pm_type" | "line" | "machine_area";

/** Minimal row shape — widgets only select the grouping column + quantity. */
type AggregateRow = {
  quantity: number | null;
  pm_type?: string | null;
  line?: string | null;
  machine_area?: string | null;
};

/**
 * Groups used-submission rows by a free-text field (e.g. `line` or
 * `pm_type`), folding blanks/whitespace into a single "Unspecified" bucket
 * so charts don't end up with a dozen near-duplicate slices. Sorted by
 * submission count, descending.
 */
export function groupSubmissionsByField(
  rows: AggregateRow[],
  field: AggregateField,
): FieldBreakdown[] {
  const map = new Map<string, FieldBreakdown>();
  for (const row of rows) {
    const raw = row[field];
    const label = typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : "Unspecified";
    const qty = typeof row.quantity === "number" ? row.quantity : 0;
    const existing = map.get(label);
    if (existing) {
      existing.count += 1;
      existing.quantity += qty;
    } else {
      map.set(label, { label, count: 1, quantity: qty });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

/**
 * Caps a sorted breakdown to `maxSlices` entries, folding the long tail into
 * a single "Other" bucket. Some fields (e.g. `line`) are free text on the
 * form and can produce 20+ distinct values -- without this, a pie/donut
 * legend grows past its widget instead of staying readable.
 */
export function capBreakdown(items: FieldBreakdown[], maxSlices = 8): FieldBreakdown[] {
  if (items.length <= maxSlices) return items;

  const head = items.slice(0, maxSlices - 1);
  const tail = items.slice(maxSlices - 1);
  const other = tail.reduce<FieldBreakdown>(
    (acc, item) => ({
      label: "Other",
      count: acc.count + item.count,
      quantity: acc.quantity + item.quantity,
    }),
    { label: "Other", count: 0, quantity: 0 },
  );

  return [...head, other];
}
