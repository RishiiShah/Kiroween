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
  { id: "halloween", label: "Halloween", note: "Pumpkin on midnight plum", canvas: "#16111c", accent: "#ff7a1a" },
  { id: "light", label: "Light", note: "Warm paper", canvas: "#fbfaf7", accent: "#5b3fd6" },
  { id: "dark", label: "Dark", note: "Neutral charcoal", canvas: "#131215", accent: "#a08cf7" },
  { id: "midnight", label: "Midnight", note: "Deep navy and cyan", canvas: "#0d1420", accent: "#4cc2ff" },
  { id: "contrast", label: "High contrast", note: "Black, white, yellow", canvas: "#000000", accent: "#ffd60a" },
  { id: "system", label: "Match system", note: "Light or dark from your OS", canvas: "#fbfaf7", accent: "#131215" },
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
