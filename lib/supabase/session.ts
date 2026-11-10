import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Profile, UserPreferences } from "@/lib/supabase/types";

type UserPreferencesSubset = Pick<
  UserPreferences,
  "background" | "density" | "dashboard_layout"
>;

/**
 * Request-scoped auth helpers. React `cache()` dedupes these within a single
 * RSC render, so layout + page + WelcomeHeader share one getUser() and one
 * profiles fetch instead of firing them 2–3 times each.
 *
 * Middleware still calls getUser() separately — that refresh is what keeps
 * the session cookie alive and must stay outside this cache.
 */

export const getSessionUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getProfile = cache(async (userId: string): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("failed to load profile", error);
    return null;
  }
  return data;
});

/**
 * Request-scoped preferences. The admin layout wants background/density, the
 * dashboard page wants dashboard_layout, and Settings wants background/density
 * again — all for the same user in the same render. Selecting all three once
 * turns two or three round trips into one.
 */
export const getUserPreferences = cache(
  async (userId: string): Promise<UserPreferencesSubset | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_preferences")
      .select("background, density, dashboard_layout")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("failed to load user preferences", error);
      return null;
    }
    return data;
  },
);
