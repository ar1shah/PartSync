/**
 * Admin background presets. `className` is applied to the admin shell; the
 * gradient/dotted ones map to custom classes defined in app/globals.css.
 * `swatchClassName` is used for the small preview in Settings.
 */
export interface BackgroundPreset {
  id: string;
  label: string;
  className: string;
  swatchClassName: string;
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { id: "default", label: "Slate", className: "bg-slate-50", swatchClassName: "bg-slate-50" },
  { id: "white", label: "White", className: "bg-white", swatchClassName: "bg-white" },
  { id: "stone", label: "Warm stone", className: "bg-stone-100", swatchClassName: "bg-stone-100" },
  {
    id: "blue_gradient",
    label: "Soft blue",
    className: "skaps-bg-blue-gradient",
    swatchClassName: "skaps-bg-blue-gradient",
  },
  {
    id: "slate_gradient",
    label: "Deep slate",
    className: "skaps-bg-slate-gradient",
    swatchClassName: "skaps-bg-slate-gradient",
  },
  { id: "dots", label: "Dotted grid", className: "skaps-bg-dots", swatchClassName: "skaps-bg-dots" },
];

const DEFAULT = BACKGROUND_PRESETS[0];

export function getBackgroundPreset(id: string | null | undefined): BackgroundPreset {
  return BACKGROUND_PRESETS.find((b) => b.id === id) ?? DEFAULT;
}

/** Tailwind class that tightens widget/table padding in compact density. */
export function densityClass(density: string | null | undefined): string {
  return density === "compact" ? "skaps-density-compact" : "";
}
