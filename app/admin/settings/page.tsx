import { Settings as SettingsIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getRole } from "@/lib/auth/roles";
import { can } from "@/lib/auth/permissions";
import { ProfileForm } from "./ProfileForm";
import { PasswordForm } from "./PasswordForm";
import { InviteForm } from "./InviteForm";
import { AppearanceForm } from "./AppearanceForm";
import { AvatarUploadForm } from "./AvatarUploadForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: prefs }, role] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name, last_name, display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("user_preferences")
      .select("background, density")
      .eq("user_id", user.id)
      .maybeSingle(),
    getRole(user.id),
  ]);
  const canInvite = can(role, "staff.invite");

  const density = prefs?.density === "compact" ? "compact" : "comfortable";

  return (
    <div>
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
          <SettingsIcon className="h-5 w-5 text-blue-700" />
          Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {canInvite
            ? "Manage your profile, change your password, and invite staff."
            : "Manage your profile and change your password."}
        </p>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Your profile</CardTitle>
            <p className="text-sm text-slate-500">
              Used by the &quot;Welcome back&quot; header on the dashboard.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <AvatarUploadForm
              name={profile?.display_name || `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || (user.email ?? "")}
              avatarUrl={profile?.avatar_url ?? null}
            />
            <ProfileForm
              email={user.email ?? ""}
              firstName={profile?.first_name ?? ""}
              lastName={profile?.last_name ?? ""}
              displayName={profile?.display_name ?? ""}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <p className="text-sm text-slate-500">
              Pick something at least 8 characters long.
            </p>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Dashboard appearance</CardTitle>
            <p className="text-sm text-slate-500">
              Pick a background and density. These are yours only -- everyone
              else keeps their own look.
            </p>
          </CardHeader>
          <CardContent>
            <AppearanceForm
              initialBackground={prefs?.background ?? "default"}
              initialDensity={density}
            />
          </CardContent>
        </Card>

        {canInvite && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Invite staff</CardTitle>
              <p className="text-sm text-slate-500">
                Sends an email invite via Supabase. The recipient joins as
                staff, creates their own password and lands on the dashboard.
                Staff can&apos;t see the activity log, invite anyone, add parts,
                import Excel, or delete repair entries.
              </p>
            </CardHeader>
            <CardContent>
              <InviteForm />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
