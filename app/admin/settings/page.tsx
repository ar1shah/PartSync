import { Settings as SettingsIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
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

  const [{ data: profile }, { data: prefs }] = await Promise.all([
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
  ]);

  const density = prefs?.density === "compact" ? "compact" : "comfortable";

  return (
    <div>
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
          <SettingsIcon className="h-5 w-5 text-blue-700" />
          Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your profile, change your password, and invite other admins.
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
              Pick a background and density. These are yours only -- other
              admins keep their own look.
            </p>
          </CardHeader>
          <CardContent>
            <AppearanceForm
              initialBackground={prefs?.background ?? "default"}
              initialDensity={density}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Invite an admin</CardTitle>
            <p className="text-sm text-slate-500">
              Sends an email invite via Supabase. The recipient creates their
              own password and lands on the dashboard.
            </p>
          </CardHeader>
          <CardContent>
            <InviteForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
