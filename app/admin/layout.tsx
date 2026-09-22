import { redirect } from "next/navigation";
import { AdminMobileNav } from "@/components/nav/AdminMobileNav";
import { AdminSidebar } from "@/components/nav/AdminSidebar";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getSessionUser } from "@/lib/supabase/session";
import { cn } from "@/lib/utils";
import { densityClass, getBackgroundPreset } from "@/lib/dashboard/backgrounds";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Belt-and-suspenders: middleware also redirects, but if someone disables
  // middleware for testing the page itself still won't render unauth'd.
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();
  const [{ data: unreadCount }, { data: prefs }, profile] = await Promise.all([
    supabase.rpc("unread_notification_count"),
    supabase
      .from("user_preferences")
      .select("background, density")
      .eq("user_id", user.id)
      .maybeSingle(),
    getProfile(user.id),
  ]);

  const background = getBackgroundPreset(prefs?.background);
  const userName =
    profile?.display_name ||
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
    (user.email ?? "Admin");

  return (
    <div className={cn("flex min-h-dvh", background.className, densityClass(prefs?.density))}>
      <AdminSidebar
        unreadCount={unreadCount ?? 0}
        userName={userName}
        avatarUrl={profile?.avatar_url ?? null}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminMobileNav unreadCount={unreadCount ?? 0} />
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{children}</div>
      </div>
    </div>
  );
}
