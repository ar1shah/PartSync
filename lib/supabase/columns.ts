/**
 * Shared column lists for admin list pages. Omitting `raw` (the full Google
 * Form header→value dump) cuts most of the payload weight — no UI reads it.
 */

/** Columns needed by SubmissionsTable / RequestsListClient. */
export const SUBMISSION_LIST_COLUMNS =
  "id, submitted_at, employee_name, skaps_number, part_description, quantity, line, machine_area, pm_type, urgency, notes, status, expense_status, po_number, received_at, price, form_type, external_row_id" as const;
