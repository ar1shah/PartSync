/**
 * Post-insert notification generator. Submissions/notifications stay in the
 * legacy PartSync Supabase project during phase 1, while SKAPS matching is
 * resolved against the new SKAPS Spare Parts Inventory project.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, NotificationInsert, Submission } from "@/lib/supabase/types";
import { isUrgent } from "./normalize";
import {
  findFuzzyInventoryMatches,
  findInventoryPartBySkapsNumber,
} from "@/lib/inventory-backend/match";

type Client = SupabaseClient<Database>;

export async function emitNotificationsForSubmission(
  client: Client,
  submission: Submission,
): Promise<void> {
  const inserts: NotificationInsert[] = [];

  if (submission.form_type === "request") {
    inserts.push({
      type: "new_request",
      title: `Parts request: ${submission.part_description ?? "(no description)"}`,
      body: `${submission.employee_name ?? "Someone"} requested ${submission.quantity ?? "?"} ${
        submission.skaps_number ? `of ${submission.skaps_number}` : ""
      }`.trim(),
      link: "/admin/requests",
    });

    if (isUrgent(submission.urgency)) {
      inserts.push({
        type: "urgent_request",
        title: `Urgent: ${submission.part_description ?? "(no description)"}`,
        body: submission.notes ?? null,
        link: "/admin/requests",
      });
    }
  }

  if (submission.form_type === "used" && submission.skaps_number) {
    const part = await findInventoryPartBySkapsNumber(submission.skaps_number);

    if (!part) {
      const fuzzy = await findFuzzyInventoryMatches(submission.skaps_number);
      const suggestions =
        fuzzy.length > 0
          ? `\nPossible matches: ${fuzzy.map((f) => `${f.skaps_number} (${f.name})`).join(", ")}`
          : "\nNo similar SKAPS# found in SKAPS Spare Parts Inventory.";

      inserts.push({
        type: "unknown_skaps",
        title: `Unmatched SKAPS #: ${submission.skaps_number}`,
        body:
          `${submission.employee_name ?? "Someone"} logged ${submission.quantity ?? "?"} used but ` +
          `"${submission.skaps_number}" does not match the new SKAPS inventory. ` +
          `Please review manually.${suggestions}`,
        link: "/admin/used",
      });

      await client
        .from("submissions")
        .update({ status: "needs_review" })
        .eq("id", submission.id);
    } else {
      const matchedNote =
        submission.skaps_number !== part.skaps_number
          ? ` Typed as "${submission.skaps_number}", matched to ${part.skaps_number}.`
          : "";

      inserts.push({
        type: "stock_updated",
        title: `Usage logged: ${part.name} (${part.skaps_number})`,
        body:
          `${submission.employee_name ?? "Someone"} used ${submission.quantity ?? "?"} unit(s).` +
          `${matchedNote} Current SKAPS inventory quantity: ${Math.max(0, part.current_quantity)}.`,
        link: "/admin/inventory",
      });
    }
  }

  if (submission.form_type === "used" && !submission.skaps_number) {
    inserts.push({
      type: "unknown_skaps",
      title: "Parts used: no SKAPS # provided",
      body:
        `${submission.employee_name ?? "Someone"} logged a parts-used entry with no SKAPS number. ` +
        `Part: ${submission.part_description ?? "(no description)"}. Please review manually.`,
      link: "/admin/used",
    });

    await client
      .from("submissions")
      .update({ status: "needs_review" })
      .eq("id", submission.id);
  }

  if (inserts.length === 0) return;

  const { error } = await client.from("notifications").insert(inserts);
  if (error) console.error("Failed to write notifications", error);
}
