import { animate, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Command,
  Copy,
  Download,
  FileText,
  GitBranch,
  GitCompareArrows,
  GitPullRequest,
  GitPullRequestDraft,
  Ghost,
  HeartPulse,
  KanbanSquare,
  LayoutDashboard,
  Loader2,
  MessageSquare,
  MoonStar,
  Palette,
  Printer,
  RefreshCw,
  Search,
  Settings2,
  Skull,
  Sparkles,
  Star,
  Table2,
  Trash2,
  TriangleAlert,
  Upload,
  Users,
  Volume2,
  VolumeX,
  Wind,
  X,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  alert: TriangleAlert,
  board: KanbanSquare,
  branch: GitBranch,
  check: Check,
  close: X,
  command: Command,
  compare: GitCompareArrows,
  copy: Copy,
  download: Download,
  draft: GitPullRequestDraft,
  gear: Settings2,
  ghost: Ghost,
  home: LayoutDashboard,
  issue: CircleDot,
  link: ArrowUpRight,
  loader: Loader2,
  message: MessageSquare,
  moon: MoonStar,
  motion: Wind,
  next: ChevronRight,
  palette: Palette,
  prev: ChevronLeft,
  print: Printer,
  pull: GitPullRequest,
  pulse: HeartPulse,
  refresh: RefreshCw,
  report: FileText,
  search: Search,
  skull: Skull,
  sound: Volume2,
  sparkles: Sparkles,
  star: Star,
  table: Table2,
  trash: Trash2,
  upload: Upload,
  users: Users,
  mute: VolumeX,
};

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const Component = ICONS[name] ?? Ghost;
  return (
    <Component
      size={size}
      strokeWidth={1.75}
      aria-hidden="true"
      focusable="false"
      className={className}
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
