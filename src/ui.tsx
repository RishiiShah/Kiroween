import { animate, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import {
  Activity,
  Clock3,
  FileDiff,
  FileMinus,
  FilePen,
  FilePlus,
  GitGraph,
  GitMerge,
  ShieldCheck,
  Tag,
  Spline,
  ArrowUpRight,
  Binoculars,
  BookOpen,
  Castle,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Command,
  Copy,
  Crosshair,
  DoorOpen,
  Download,
  Eye,
  FileText,
  Flashlight,
  Footprints,
  GitBranch,
  GitCompareArrows,
  GitPullRequest,
  GitPullRequestDraft,
  Ghost,
  HeartPulse,
  LayoutDashboard,
  ListTodo,
  LoaderCircle,
  MessageSquare,
  MoonStar,
  Orbit,
  Palette,
  Printer,
  Radar,
  RefreshCw,
  Rocket,
  Satellite,
  ScrollText,
  Search,
  Settings2,
  Skull,
  Sparkles,
  SquareKanban,
  Star,
  Table2,
  Telescope,
  Tombstone,
  Trash2,
  TriangleAlert,
  Upload,
  Users,
  Volume2,
  VolumeX,
  WandSparkles,
  Wind,
  X,
  type LucideIcon,
} from "lucide-react";
import { createContext, useContext } from "react";

/** Semantic icon names. Each theme may draw a name differently; the meaning never changes. */
const ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  clock: Clock3,
  diff: FileDiff,
  "file-add": FilePlus,
  "file-del": FileMinus,
  "file-edit": FilePen,
  graph: GitGraph,
  merge: GitMerge,
  shield: ShieldCheck,
  tag: Tag,
  alert: TriangleAlert,
  board: SquareKanban,
  branch: GitBranch,
  check: Check,
  close: X,
  command: Command,
  compare: GitCompareArrows,
  copy: Copy,
  demo: Sparkles,
  download: Download,
  draft: GitPullRequestDraft,
  gear: Settings2,
  ghost: Ghost,
  home: LayoutDashboard,
  issue: CircleDot,
  link: ArrowUpRight,
  loader: LoaderCircle,
  message: MessageSquare,
  moon: MoonStar,
  motion: Wind,
  mute: VolumeX,
  next: ChevronRight,
  palette: Palette,
  prev: ChevronLeft,
  print: Printer,
  pull: GitPullRequest,
  pulse: HeartPulse,
  refresh: RefreshCw,
  report: FileText,
  search: Search,
  skull: ListTodo,
  sound: Volume2,
  sparkles: Sparkles,
  star: Star,
  table: Table2,
  trash: Trash2,
  upload: Upload,
  users: Users,
};
export type IconSet = "standard" | "halloween" | "midnight" | "contrast";
const OVERRIDES: Record<IconSet, Record<string, LucideIcon>> = {
  standard: {},
  contrast: {},
  halloween: {
    home: Castle,
    pulse: Footprints,
    branch: DoorOpen,
    skull: Skull,
    alert: Eye,
    board: Tombstone,
    issue: ScrollText,
    table: BookOpen,
    demo: WandSparkles,
    sparkles: WandSparkles,
    search: Flashlight,
    palette: MoonStar,
  },
  midnight: {
    graph: Spline,
    home: Telescope,
    pulse: Orbit,
    branch: Satellite,
    skull: Radar,
    alert: Crosshair,
    demo: Rocket,
    sparkles: Rocket,
    search: Binoculars,
    palette: MoonStar,
  },
};
const STROKE: Record<IconSet, number> = {
  standard: 1.75,
  halloween: 1.75,
  midnight: 1.5,
  contrast: 2.25,
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
  const Component = OVERRIDES[set][name] ?? ICONS[name] ?? Ghost;
  return (
    <Component
      size={set === "contrast" ? size + 1 : size}
      strokeWidth={STROKE[set]}
      aria-hidden="true"
      focusable="false"
      className={className ? `icon ${className}` : "icon"}
    />
  );
}

/** Counts up on mount. Screen readers get the final value only. */
export function NumberTicker({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  useEffect(() => {
    if (reduce) {
      setShown(value);
      return;
    }
    const controls = animate(0, value, {
      duration: Math.min(1.2, 0.4 + value / 200),
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setShown(Math.round(latest)),
    });
    return () => controls.stop();
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
