import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowsClockwise,
  BookOpen,
  Binoculars,
  Broadcast,
  CaretLeft,
  CaretRight,
  CastleTurret,
  ChatCircleDots,
  Check,
  CircleDashed,
  CircleNotch,
  Clock,
  Command,
  Copy,
  Crosshair,
  DoorOpen,
  DownloadSimple,
  Eye,
  FileMinus,
  FilePlus,
  FileText,
  Flashlight,
  Footprints,
  GearSix,
  Ghost,
  GitBranch,
  GitDiff,
  GitFork,
  GitMerge,
  GitPullRequest,
  Heartbeat,
  Kanban,
  Lightning,
  ListChecks,
  MagicWand,
  MagnifyingGlass,
  MoonStars,
  Palette,
  PencilSimple,
  Planet,
  Printer,
  Pulse,
  Rocket,
  Scroll,
  SealCheck,
  Skull,
  Sparkle,
  SpeakerHigh,
  SpeakerSlash,
  SquaresFour,
  Star,
  Table,
  Tag,
  Target,
  Trash,
  UploadSimple,
  UsersThree,
  WarningCircle,
  Wind,
  X,
  type Icon as PhosphorIcon,
  type IconWeight,
} from "@phosphor-icons/react";
import { createContext, useContext } from "react";

/**
 * Global motion pace. Every duration and stagger runs through t() so the whole UI can be
 * tuned in one place. Springs use soft stiffness with critical-ish damping: no bounce.
 */
export const PACE = 1.6;
export const t = (seconds: number) => Math.round(seconds * PACE * 1000) / 1000;
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

type Glyph = { id: string; icon: PhosphorIcon };
const g = (id: string, icon: PhosphorIcon): Glyph => ({ id, icon });

/** Semantic icon names. Each theme may draw a name differently; the meaning never changes. */
const ICONS: Record<string, Glyph> = {
  activity: g("pulse", Pulse),
  alert: g("warning", WarningCircle),
  board: g("kanban", Kanban),
  branch: g("git-branch", GitBranch),
  check: g("check", Check),
  clock: g("clock", Clock),
  close: g("x", X),
  command: g("command", Command),
  compare: g("git-diff", GitDiff),
  copy: g("copy", Copy),
  demo: g("sparkle", Sparkle),
  diff: g("git-diff", GitDiff),
  download: g("download", DownloadSimple),
  draft: g("circle-dashed", CircleDashed),
  "file-add": g("file-plus", FilePlus),
  "file-del": g("file-minus", FileMinus),
  "file-edit": g("pencil", PencilSimple),
  gear: g("gear", GearSix),
  go: g("arrow-right", ArrowRight),
  ghost: g("ghost", Ghost),
  graph: g("git-fork", GitFork),
  home: g("squares-four", SquaresFour),
  issue: g("target", Target),
  link: g("arrow-up-right", ArrowUpRight),
  loader: g("circle-notch", CircleNotch),
  merge: g("git-merge", GitMerge),
  message: g("chat", ChatCircleDots),
  moon: g("moon-stars", MoonStars),
  motion: g("wind", Wind),
  mute: g("speaker-slash", SpeakerSlash),
  next: g("caret-right", CaretRight),
  palette: g("palette", Palette),
  prev: g("caret-left", CaretLeft),
  print: g("printer", Printer),
  pull: g("git-pull-request", GitPullRequest),
  pulse: g("heartbeat", Heartbeat),
  refresh: g("arrows-clockwise", ArrowsClockwise),
  report: g("file-text", FileText),
  search: g("magnifying-glass", MagnifyingGlass),
  shield: g("seal-check", SealCheck),
  skull: g("list-checks", ListChecks),
  sound: g("speaker-high", SpeakerHigh),
  sparkles: g("sparkle", Sparkle),
  star: g("star", Star),
  table: g("table", Table),
  tag: g("tag", Tag),
  trash: g("trash", Trash),
  upload: g("upload", UploadSimple),
  users: g("users-three", UsersThree),
};
export type IconSet = "standard" | "halloween" | "midnight" | "contrast";
const OVERRIDES: Record<IconSet, Record<string, Glyph>> = {
  standard: {},
  contrast: {},
  halloween: {
    home: g("castle-turret", CastleTurret),
    pulse: g("footprints", Footprints),
    branch: g("door-open", DoorOpen),
    skull: g("skull", Skull),
    alert: g("eye", Eye),
    issue: g("scroll", Scroll),
    table: g("book-open", BookOpen),
    demo: g("magic-wand", MagicWand),
    sparkles: g("magic-wand", MagicWand),
    search: g("flashlight", Flashlight),
    palette: g("moon-stars", MoonStars),
  },
  midnight: {
    home: g("planet", Planet),
    pulse: g("broadcast", Broadcast),
    branch: g("git-fork", GitFork),
    skull: g("crosshair", Crosshair),
    alert: g("lightning", Lightning),
    demo: g("rocket", Rocket),
    sparkles: g("rocket", Rocket),
    search: g("binoculars", Binoculars),
    palette: g("moon-stars", MoonStars),
  },
};
const WEIGHT: Record<IconSet, IconWeight> = {
  standard: "duotone",
  halloween: "duotone",
  midnight: "light",
  contrast: "bold",
};
export const IconSetContext = createContext<IconSet>("standard");

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const set = useContext(IconSetContext);
  const glyph = OVERRIDES[set][name] ?? ICONS[name] ?? ICONS.ghost;
  const Component = glyph.icon;
  const weight =
    name === "loader" || name === "go" ? "bold" : WEIGHT[set];
  return (
    <Component
      size={set === "contrast" ? size + 2 : size + 1}
      weight={weight}
      aria-hidden="true"
      focusable="false"
      data-glyph={glyph.id}
      data-weight={weight}
      className={className ? `icon ${className}` : "icon"}
    />
  );
}

/** Custom brand mark: a ghost whose eyes are two commits joined by a merge curve. */
export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="logo"
    >
      <path
        d="M4.6 20.6V11.1a7.4 7.4 0 0 1 14.8 0v9.5l-2.45-1.85-2.48 1.85L12 18.75l-2.47 1.85-2.48-1.85z"
        className="logo-body"
      />
      <path d="M9.4 10.6c0 3 5.2 3 5.2 0" className="logo-branch" />
      <circle cx="9.4" cy="10.4" r="1.55" className="logo-eye" />
      <circle cx="14.6" cy="10.4" r="1.55" className="logo-eye" />
    </svg>
  );
}

/** Counts up on mount with an ease-out curve. Screen readers get the final value only. */
export function NumberTicker({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  useEffect(() => {
    if (reduce || typeof requestAnimationFrame !== "function") {
      setShown(value);
      return;
    }
    const duration = t(Math.min(1.2, 0.4 + value / 200)) * 1000;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      setShown(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, reduce]);
  return (
    <span className={className}>
      <span aria-hidden="true">{shown.toLocaleString()}</span>
      <span className="sr-only">{value.toLocaleString()}</span>
    </span>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} style={{ width: `${92 - ((index * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export const isMac = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
