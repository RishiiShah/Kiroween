export type ThemeId =
  | "halloween"
  | "light"
  | "dark"
  | "midnight"
  | "contrast"
  | "system";
export type ResolvedTheme = Exclude<ThemeId, "system">;

export const DEFAULT_THEME: ThemeId = "halloween";
const KEY = "poltergeist.theme.v1";

/** Preview colors are only used for the picker swatches and browser chrome. */
export const THEMES: {
  id: ThemeId;
  label: string;
  note: string;
  canvas: string;
  accent: string;
}[] = [
  { id: "halloween", label: "Halloween", note: "Pumpkin, slime and ghost violet", canvas: "#100c15", accent: "#ff7a1a" },
  { id: "light", label: "Light", note: "Warm parchment", canvas: "#faf8f4", accent: "#c2410c" },
  { id: "dark", label: "Dark", note: "Graphite with ember", canvas: "#111113", accent: "#fb923c" },
  { id: "midnight", label: "Midnight", note: "Deep navy and cyan", canvas: "#0d1420", accent: "#4cc2ff" },
  { id: "contrast", label: "High contrast", note: "Black, white, yellow", canvas: "#000000", accent: "#ffd60a" },
  { id: "system", label: "Match system", note: "Light or dark from your OS", canvas: "#faf8f4", accent: "#111113" },
];
const DARK: Record<ResolvedTheme, boolean> = {
  halloween: true,
  light: false,
  dark: true,
  midnight: true,
  contrast: true,
};

export const isThemeId = (value: unknown): value is ThemeId =>
  THEMES.some((theme) => theme.id === value);

export function resolveTheme(theme: ThemeId, prefersDark: boolean): ResolvedTheme {
  return theme === "system" ? (prefersDark ? "dark" : "light") : theme;
}
export const isDarkTheme = (theme: ResolvedTheme) => DARK[theme];
export const themeCanvas = (theme: ResolvedTheme) =>
  THEMES.find((item) => item.id === theme)!.canvas;

export function loadTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(KEY);
    return isThemeId(saved) ? saved : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}
export function saveTheme(theme: ThemeId) {
  try {
    if (theme === DEFAULT_THEME) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    /* Theme still applies for this session. */
  }
}

const query = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;
export function subscribeScheme(listener: () => void) {
  const media = query();
  media?.addEventListener("change", listener);
  return () => media?.removeEventListener("change", listener);
}
export const getPrefersDark = () => query()?.matches ?? false;

import type { IconSet } from "./ui";
export const iconSetFor = (theme: ResolvedTheme): IconSet =>
  theme === "halloween" ? "halloween" : theme === "midnight" ? "midnight" : theme === "contrast" ? "contrast" : "standard";
