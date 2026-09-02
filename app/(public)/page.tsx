import Link from "next/link";
import { ArrowRight, ClipboardList, Package, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { createInventoryServiceClient } from "@/lib/inventory-backend/server";
import { formatNumber } from "@/lib/utils";

export const revalidate = 60;

async function loadStats() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const inventory = createInventoryServiceClient();
  const [{ count: partsCount }, { count: usedThisWeekCount }] = await Promise.all([
    inventory
      .from("parts_app_view")
      .select("part_id", { count: "exact", head: true })
      .eq("active", true),
    supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("form_type", "used")
      .gte("submitted_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  return {
    parts: partsCount ?? 0,
    usedThisWeek: usedThisWeekCount ?? 0,
  };
}

export default async function HomePage() {
  const stats = await loadStats();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-20">
      {/* Hero */}
      <section className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-center">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-blue-700">
            SKAPS Maintenance
          </p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl">
            Parts inventory, kept honest.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600">
            Submit a part-used or part-request form when you need to log usage
            or ask for stock. Admins can sign in to browse the full SKAPS spare-parts
            inventory and review submissions. Forms remain connected for workflow
            intake while the master inventory is served from the dedicated SKAPS database.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link href="/forms">
                Submit a form
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">Admin sign in</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {stats ? (
            <>
              <StatCard
                label="Parts tracked"
                value={formatNumber(stats.parts)}
                sub="in the master inventory"
                icon={<Package className="h-5 w-5 text-blue-700" />}
              />
              <StatCard
                label="Used this week"
                value={formatNumber(stats.usedThisWeek)}
                sub="parts-used form submissions"
                icon={<ClipboardList className="h-5 w-5 text-blue-700" />}
              />
            </>
          ) : (
            <>
              <StatCard
                label="Inventory"
                value="Admin only"
                sub="sign in to view live counts"
                icon={<Package className="h-5 w-5 text-blue-700" />}
              />
              <StatCard
                label="Forms"
                value="Open"
                sub="submit parts-used or request forms"
                icon={<ClipboardList className="h-5 w-5 text-blue-700" />}
              />
            </>
          )}
        </div>
      </section>

      {/* Feature row */}
      <section className="mt-16 grid gap-4 sm:grid-cols-3">
        <FeatureLink
          href="/login?next=/inventory"
          icon={<Search className="h-5 w-5" />}
          title="Browse inventory"
          body="Sign in to search by SKAPS number or part name. Filter by category, location, or stock status."
        />
        <FeatureLink
          href="/forms"
          icon={<ClipboardList className="h-5 w-5" />}
          title="Submit a form"
          body="Open the parts-used or parts-request Google Form. Submissions sync here automatically."
        />
        <FeatureLink
          href="/login"
          icon={<Package className="h-5 w-5" />}
          title="Admin dashboard"
          body="Sign in to manage inventory, review requests, and read notifications."
        />
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-5">
        <div className="rounded-md bg-blue-50 p-2.5">{icon}</div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function FeatureLink({
  href,
  icon,
  title,
  body,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-lg border border-slate-200 bg-white p-5 transition-colors hover:border-blue-300 hover:bg-blue-50/40"
    >
      <div className="flex items-center gap-2 text-blue-700">
        {icon}
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
      <p className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-700 group-hover:underline">
        Open
        <ArrowRight className="h-3.5 w-3.5" />
      </p>
    </Link>
  );
}
