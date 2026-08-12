import { cn } from "@/lib/utils";

interface AvatarProps {
  name?: string | null;
  src?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE: Record<NonNullable<AvatarProps["size"]>, { box: string; text: string }> = {
  sm: { box: "h-7 w-7", text: "text-[11px]" },
  md: { box: "h-9 w-9", text: "text-xs" },
  lg: { box: "h-12 w-12", text: "text-sm" },
};

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Profile picture with an initials fallback. Used in nav, header and audit rows. */
export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  const s = SIZE[size];

  if (src) {
    // Plain <img> to match the rest of the app (parts images) and avoid
    // next/image remote-host configuration for the Supabase storage domain.
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={name ?? "Avatar"}
        className={cn("shrink-0 rounded-full object-cover", s.box, className)}
      />
    );
  }

  return (
    <span
      aria-label={name ?? "Avatar"}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700",
        s.box,
        s.text,
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
