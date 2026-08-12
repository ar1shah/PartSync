"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSiteUrl } from "@/lib/site-url";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

export interface ActionState {
  ok?: boolean;
  error?: string;
}

const ProfileInput = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(80),
  last_name: z.string().trim().min(1, "Last name is required").max(80),
  display_name: z.string().trim().max(80).optional(),
});

export async function updateProfile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const parsed = ProfileInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(", ") };
  }

  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    first_name: parsed.data.first_name,
    last_name: parsed.data.last_name,
    // Empty nickname clears the override rather than storing "".
    display_name: parsed.data.display_name ? parsed.data.display_name : null,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  return { ok: true };
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export async function uploadAvatar(formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image to upload" };
  }
  if (!file.type.startsWith("image/")) {
    return { error: "Avatar must be an image" };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { error: "Avatar must be 2 MB or smaller" };
  }

  // Stable per-user path so we never accumulate orphaned files. A cache-buster
  // query param is added to the stored URL so the new image shows immediately.
  const path = `${user.id}/avatar`;
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) return { error: uploadError.message };

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path);
  const bustedUrl = `${publicUrl}?v=${Date.now()}`;

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, avatar_url: bustedUrl });
  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function removeAvatar(): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  await supabase.storage.from("avatars").remove([`${user.id}/avatar`]);

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, avatar_url: null });
  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  return { ok: true };
}

const AppearanceInput = z.object({
  background: z.string().trim().max(40),
  density: z.enum(["comfortable", "compact"]),
});

export async function updateAppearance(
  input: z.infer<typeof AppearanceInput>,
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const parsed = AppearanceInput.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(", ") };
  }

  const { error } = await supabase.from("user_preferences").upsert(
    {
      user_id: user.id,
      background: parsed.data.background,
      density: parsed.data.density,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  return { ok: true };
}

const PasswordInput = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function changePassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const parsed = PasswordInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(", ") };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };

  return { ok: true };
}

const InviteInput = z.object({
  email: z.string().trim().email("Enter a valid email"),
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
});

export async function inviteAdmin(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = InviteInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(", ") };
  }

  // We need the service role to send invites. The signed-in user is
  // already an admin (middleware gate), so this is safe.
  const service = createServiceClient();
  const redirectTo = `${getSiteUrl()}/auth/callback?next=/admin/settings`;
  const { error } = await service.auth.admin.inviteUserByEmail(parsed.data.email, {
    redirectTo,
    data: {
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
    },
  });

  if (error) return { error: error.message };

  await recordAudit({
    action: "admin.invited",
    entityType: "profile",
    entityLabel: parsed.data.email,
    summary: `Invited ${parsed.data.first_name} ${parsed.data.last_name} (${parsed.data.email}) as an admin`,
  });

  return { ok: true };
}
