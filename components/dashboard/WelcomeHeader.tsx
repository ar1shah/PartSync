import { Avatar } from "@/components/ui/Avatar";
import { getProfile, getSessionUser } from "@/lib/supabase/session";

/**
 * Top-of-dashboard greeting. Prefers the optional display name, then the
 * first/last name from `profiles`, falling back to the email username.
 */
export async function WelcomeHeader() {
  const user = await getSessionUser();

  let displayName = "there";
  let fullName = "";
  let avatarUrl: string | null = null;
  if (user) {
    const profile = await getProfile(user.id);
    avatarUrl = profile?.avatar_url ?? null;
    const first = profile?.first_name?.trim();
    const last = profile?.last_name?.trim();
    const nickname = profile?.display_name?.trim();
    fullName = [first, last].filter(Boolean).join(" ");

    if (nickname) {
      displayName = nickname;
    } else if (first && last) {
      displayName = `${first} ${last}`;
    } else if (first) {
      displayName = first;
    } else if (user.email) {
      displayName = user.email.split("@")[0];
    }
  }

  // Hour-aware greeting -- "Good morning" before noon, etc.
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <header className="flex items-center gap-4">
      <Avatar name={displayName || fullName} src={avatarUrl} size="lg" />
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-blue-700">{greeting}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Welcome back, {displayName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Here&apos;s what the maintenance team has been up to.
        </p>
      </div>
    </header>
  );
}
