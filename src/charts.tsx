import { t } from "./ui";
import { bin, max } from "d3-array";
import { scaleBand, scaleLinear, scaleTime } from "d3-scale";
import { arc, area, curveMonotoneX, pie } from "d3-shape";
import { motion } from "motion/react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { scaleQuantize, scaleSqrt, scaleSymlog } from "d3-scale";
import { bisector } from "d3-array";
import type { CodeWeek, Punch } from "./history";
import type { Release, Week } from "./community";
import type { AgeBucket, BranchAge } from "./activity";

const EASE = [0.16, 1, 0.3, 1] as const;

/* ---------------- Tooltip ---------------- */
type Tip = { x: number; y: number; text: string } | null;
/** Hover tooltip positioned inside the chart container. Native <title> stays for assistive tech. */
export function useTip() {
  const [tip, setTip] = useState<Tip>(null);
  const show = useCallback((event: React.MouseEvent, text: string) => {
    const host = (event.currentTarget as Element).closest(".chart") as HTMLElement | null;
    if (!host) return;
    const box = host.getBoundingClientRect();
    setTip({ x: event.clientX - box.left, y: event.clientY - box.top, text });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  const node = tip ? (
    <motion.div
      className="chart-tip"
      style={{ left: tip.x, top: tip.y }}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: t(0.12)}}
      aria-hidden="true"
    >
      {tip.text}
    </motion.div>
  ) : null;
  return { show, hide, node };
}

/** Tracks an element's width so SVG text stays at its real size. */
function useWidth<T extends HTMLElement>(fallback = 560) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (element.clientWidth) setWidth(element.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/* ---------------- Donut ---------------- */
export type DonutSegment = { key: string; label: string; value: number; className: string };

export function Donut({
  segments,
  center,
  caption,
  label,
}: {
  segments: DonutSegment[];
  center: string;
  caption: string;
  label: string;
}) {
  const size = 168;
  const radius = size / 2;
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const arcs = pie<DonutSegment>()
    .value((segment) => segment.value)
    .sort(null)
    .padAngle(total > 1 ? 0.025 : 0)(segments.filter((segment) => segment.value > 0));
  const shape = arc<(typeof arcs)[number]>()
    .innerRadius(radius * 0.66)
    .outerRadius(radius - 2)
    .cornerRadius(3);
  return (
    <figure className="chart donut">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label}>
        <g transform={`translate(${radius} ${radius})`}>
          <circle r={radius * 0.83} className="donut-track" />
          {total === 0
            ? null
            : arcs.map((slice, index) => (
                <motion.path
                  key={slice.data.key}
                  d={shape(slice) ?? ""}
                  className={`donut-slice ${slice.data.className}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: t(0.08 * index), duration: t(0.45), ease: EASE }}
                >
                  <title>{`${slice.data.label}: ${slice.data.value}`}</title>
                </motion.path>
              ))}
        </g>
        <text
          x={radius}
          y={radius + (center.length > 5 ? 1 : 2)}
          className="donut-center"
          textAnchor="middle"
          style={{ fontSize: center.length > 7 ? 15 : center.length > 4 ? 19 : 30 }}
        >
          {center}
        </text>
        <text x={radius} y={radius + 20} className="donut-caption" textAnchor="middle">
          {caption}
        </text>
      </svg>
    </figure>
  );
}

/* ---------------- Branch ages ---------------- */
export function BranchAgeChart({
  branches,
  threshold = 90,
  onOpen,
}: {
  branches: BranchAge[];
  threshold?: number;
  onOpen: (id: string) => void;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const row = 30;
  const left = Math.min(150, Math.max(90, width * 0.32));
  const right = 46;
  const top = 18;
  const height = top + branches.length * row + 24;
  const x = scaleLinear()
    .domain([0, Math.max(threshold * 1.25, max(branches, (b) => b.days) ?? 0)])
    .range([left, width - right])
    .nice();
  const summary = branches
    .map((b) => `${b.name} ${b.days} days`)
    .join(", ");
  const tip = useTip();
  return (
    <div className="chart" ref={ref}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Branch tip age in days, ${threshold}-day review line. ${summary}.`}
      >
        {x.ticks(4).map((tick) => (
          <g key={tick} transform={`translate(${x(tick)} 0)`}>
            <line y1={top - 4} y2={height - 20} className="grid" />
            <text y={height - 6} textAnchor="middle" className="tick">
              {tick}d
            </text>
          </g>
        ))}
        {branches.map((branch, index) => {
          const y = top + index * row;
          const quiet = branch.days >= threshold;
          return (
            <g
              key={branch.id}
              className={`bar-row ${quiet ? "is-quiet" : ""}`}
              onClick={() => onOpen(branch.id)}
              onMouseMove={(event) =>
                tip.show(event, `${branch.name} · tip ${branch.days} days old${quiet ? " · past review line" : ""} · click for evidence`)
              }
              onMouseLeave={tip.hide}
            >
              <text x={left - 10} y={y + 15} textAnchor="end" className="bar-label">
                {branch.name.length > 20 ? `${branch.name.slice(0, 19)}…` : branch.name}
              </text>
              <motion.rect
                x={left}
                y={y + 4}
                height={16}
                rx={4}
                className="bar"
                initial={{ width: 0 }}
                animate={{ width: Math.max(2, x(branch.days) - left) }}
                transition={{ delay: t(0.05 * index), duration: t(0.6), ease: EASE }}
              >
                <title>{`${branch.name}: tip ${branch.days} days old`}</title>
              </motion.rect>
              <text x={x(branch.days) + 6} y={y + 16} className="bar-value">
                {branch.days}d
              </text>
            </g>
          );
        })}
        <g transform={`translate(${x(threshold)} 0)`}>
          <line y1={top - 4} y2={height - 20} className="threshold" />
          <text y={10} textAnchor="middle" className="threshold-label">
            {threshold}-day review line
          </text>
        </g>
      </svg>
      {tip.node}
    </div>
  );
}

/* ---------------- Thread age histogram ---------------- */
export function AgeHistogram({
  buckets,
  kinds = ["pull", "issue"],
  height = 160,
}: {
  buckets: AgeBucket[];
  kinds?: ("issue" | "pull")[];
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const bottom = 24;
  const top = 12;
  const left = 26;
  const x = scaleBand()
    .domain(buckets.map((b) => b.label))
    .range([left, width])
    .paddingInner(0.28)
    .paddingOuter(0.05);
  const totals = buckets.map((b) => kinds.reduce((sum, kind) => sum + b[kind], 0));
  const y = scaleLinear()
    .domain([0, Math.max(1, ...totals)])
    .range([height - bottom, top])
    .nice();
  const label = buckets
    .map((b, index) => `${b.label}: ${totals[index]}`)
    .join(", ");
  const tip = useTip();
  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={`Open threads by time since last update. ${label}.`}>
        {y.ticks(3).map((tick) => (
          <g key={tick} transform={`translate(0 ${y(tick)})`}>
            <line x1={left} x2={width} className="grid" />
            <text x={left - 6} y={3} textAnchor="end" className="tick">
              {tick}
            </text>
          </g>
        ))}
        {(() => {
          const quiet = buckets.filter((b) => b.quiet);
          if (!quiet.length) return null;
          const start = (x(quiet[0].label) ?? 0) - (x.step() * x.paddingInner()) / 2;
          const end = Math.min(
            width - 1,
            (x(quiet[quiet.length - 1].label) ?? 0) + x.bandwidth() + (x.step() * x.paddingInner()) / 2,
          );
          return (
            <g className="quiet-band">
              <rect x={start} y={top - 8} width={end - start} height={height - bottom - top + 8} rx={6} />
              <text x={end - 6} y={top + 4} textAnchor="end">
                quiet 90+ days
              </text>
            </g>
          );
        })()}
        {buckets.map((bucket, index) => {
          let base = height - bottom;
          return (
            <g
              key={bucket.label}
              className={bucket.quiet ? "is-quiet" : ""}
              onMouseMove={(event) =>
                tip.show(
                  event,
                  `Updated ${bucket.label} ago: ${kinds.map((kind) => `${bucket[kind]} ${kind === "pull" ? "PRs" : "issues"}`).join(", ")}${bucket.quiet ? " · quiet" : ""}`,
                )
              }
              onMouseLeave={tip.hide}
            >
              {kinds.map((kind) => {
                const value = bucket[kind];
                const h = (height - bottom) - y(value);
                base -= h;
                return value ? (
                  <motion.rect
                    key={kind}
                    x={x(bucket.label)}
                    width={x.bandwidth()}
                    rx={3}
                    className={`hist kind-${kind}`}
                    initial={{ y: height - bottom, height: 0 }}
                    animate={{ y: base, height: Math.max(0, h - 1) }}
                    transition={{ delay: t(0.05 * index), duration: t(0.55), ease: EASE }}
                  >
                    <title>{`${bucket.label}: ${value} ${kind === "pull" ? "pull requests" : "issues"}`}</title>
                  </motion.rect>
                ) : null;
              })}
              <text
                x={(x(bucket.label) ?? 0) + x.bandwidth() / 2}
                y={height - 6}
                textAnchor="middle"
                className="tick"
              >
                {bucket.label}
              </text>
              {totals[index] > 0 && (
                <text
                  x={(x(bucket.label) ?? 0) + x.bandwidth() / 2}
                  y={y(totals[index]) - 4}
                  textAnchor="middle"
                  className="bar-value"
                >
                  {totals[index]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {tip.node}
    </div>
  );
}

/* ---------------- Commit timeline ---------------- */
export function CommitTimeline({
  dates,
  observedAt,
  labels,
}: {
  dates: string[];
  observedAt: string;
  labels?: Record<string, string>;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const tip = useTip();
  const height = 150;
  const bottom = 24;
  const top = 14;
  const times = dates.map((value) => new Date(value)).sort((a, b) => +a - +b);
  if (!times.length) return null;
  const end = new Date(Math.max(Date.parse(observedAt), +times[times.length - 1]));
  const start = new Date(Math.min(+times[0], +end - 7 * 86400000));
  const x = scaleTime().domain([start, end]).range([8, width - 8]);
  const bins = bin<Date, Date>()
    .value((d) => d)
    .domain([start, end])
    .thresholds(x.ticks(Math.min(24, Math.max(6, Math.round(width / 40)))))(times);
  const y = scaleLinear()
    .domain([0, Math.max(1, max(bins, (b) => b.length) ?? 1)])
    .range([height - bottom - 10, top]);
  const shape = area<(typeof bins)[number]>()
    .x((b) => x(new Date((+b.x0! + +b.x1!) / 2)))
    .y0(height - bottom - 10)
    .y1((b) => y(b.length))
    .curve(curveMonotoneX);
  const fmt = (date: Date) =>
    date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <div className="chart" ref={ref} onMouseLeave={tip.hide}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${times.length} commits from ${fmt(times[0])} to ${fmt(times[times.length - 1])}; scan observed ${fmt(end)}.`}
      >
        <defs>
          <linearGradient id="timeline-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" className="fill-stop-top" />
            <stop offset="100%" className="fill-stop-bottom" />
          </linearGradient>
        </defs>
        {x.ticks(Math.max(3, Math.round(width / 130))).map((tick) => (
          <g key={+tick} transform={`translate(${x(tick)} 0)`}>
            <line y1={top} y2={height - bottom} className="grid" />
            <text y={height - 6} textAnchor="middle" className="tick">
              {fmt(tick)}
            </text>
          </g>
        ))}
        <motion.path
          d={shape(bins) ?? ""}
          fill="url(#timeline-fill)"
          className="timeline-area"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: t(0.8)}}
        />
        {times.map((time, index) => (
          <motion.circle
            key={`${+time}-${index}`}
            cx={x(time)}
            cy={height - bottom - 4}
            r={3.5}
            className="timeline-dot"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: t(0.15 + index * 0.025), duration: t(0.3)}}
            onMouseMove={(event) =>
              tip.show(
                event,
                `${time.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}${labels?.[time.toISOString()] ? ` · ${labels[time.toISOString()]}` : ""}`,
              )
            }
          >
            <title>{time.toLocaleString()}</title>
          </motion.circle>
        ))}
        <g transform={`translate(${x(end)} 0)`}>
          <line y1={top} y2={height - bottom} className="threshold" />
          <text x={-5} y={top + 9} textAnchor="end" className="threshold-label">
            scan
          </text>
        </g>
      </svg>
      {tip.node}
    </div>
  );
}

/* ---------------- Calendar heatmap (52 weeks) ---------------- */
export function CalendarHeatmap({ weeks }: { weeks: Week[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const tip = useTip();
  const left = 26;
  const top = 16;
  const gap = 3;
  const cell = Math.max(6, Math.min(20, Math.floor((width - left) / weeks.length) - gap));
  const height = top + 7 * (cell + gap) + 4;
  const peak = Math.max(1, ...weeks.flatMap((week) => week.days));
  const level = scaleQuantize<number>().domain([1, peak]).range([1, 2, 3, 4]);
  const total = weeks.reduce((sum, week) => sum + week.total, 0);
  const busiest = weeks.reduce((best, week) => (week.total > best.total ? week : best), weeks[0]);
  const months: { x: number; label: string }[] = [];
  weeks.forEach((week, index) => {
    const date = new Date(week.week);
    const label = date.toLocaleDateString(undefined, { month: "short" });
    const x = left + index * (cell + gap);
    const previous = months[months.length - 1];
    if ((!previous || previous.label !== label) && date.getUTCDate() <= 7 && (!previous || x - previous.x > 34))
      months.push({ x, label });
  });
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div className="chart" ref={ref} onMouseLeave={tip.hide}>
      <svg
        width={Math.min(width, left + weeks.length * (cell + gap))}
        height={height}
        role="img"
        aria-label={`${total} commits on the default branch over the last ${weeks.length} weeks; busiest week of ${new Date(busiest.week).toLocaleDateString()} with ${busiest.total}.`}
      >
        {months.map((month) => (
          <text key={`${month.label}-${month.x}`} x={month.x} y={10} className="tick">
            {month.label}
          </text>
        ))}
        {[1, 3, 5].map((day) => (
          <text key={day} x={0} y={top + day * (cell + gap) + cell - 2} className="tick">
            {dayNames[day]}
          </text>
        ))}
        {weeks.map((week, column) => (
          <motion.g
            key={week.week}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: t(column * 0.008), duration: t(0.3)}}
          >
            {week.days.map((count, day) => {
              const date = new Date(Date.parse(week.week) + day * 86400000);
              return (
                <rect
                  key={day}
                  x={left + column * (cell + gap)}
                  y={top + day * (cell + gap)}
                  width={cell}
                  height={cell}
                  rx={Math.min(3, cell / 4)}
                  className={`heat heat-${count ? level(count) : 0}`}
                  onMouseMove={(event) =>
                    tip.show(
                      event,
                      `${count} commit${count === 1 ? "" : "s"} · ${date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`,
                    )
                  }
                />
              );
            })}
          </motion.g>
        ))}
      </svg>
      <p className="legend heat-legend" aria-hidden="true">
        Less
        {[0, 1, 2, 3, 4].map((n) => (
          <i key={n} className={`heat-swatch heat-${n}`} />
        ))}
        More
      </p>
      {tip.node}
    </div>
  );
}

/* ---------------- Release timeline ---------------- */
export function ReleaseTimeline({ releases, observedAt }: { releases: Release[]; observedAt: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const tip = useTip();
  const height = 130;
  const axis = 100;
  const items = [...releases].sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
  if (!items.length) return null;
  const end = new Date(Math.max(Date.parse(observedAt), Date.parse(items[items.length - 1].publishedAt)));
  const start = new Date(Math.min(Date.parse(items[0].publishedAt), +end - 30 * 86400000));
  const x = scaleTime().domain([start, end]).range([16, width - 16]);
  const gaps = items.slice(1).map((r, i) => (Date.parse(r.publishedAt) - Date.parse(items[i].publishedAt)) / 86400000);
  const median = gaps.length ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : null;
  // Greedy label placement: up to 3 stacked levels; a label is hidden (tooltip only) if no level has room.
  const lastAt = [-Infinity, -Infinity, -Infinity];
  const levels: number[] = [];
  const showLabel: boolean[] = [];
  for (const release of items) {
    const cx = x(new Date(release.publishedAt));
    const level = lastAt.findIndex((at) => cx - at > 62);
    levels.push(level === -1 ? 0 : level);
    showLabel.push(level !== -1);
    if (level !== -1) lastAt[level] = cx;
  }
  return (
    <div className="chart" ref={ref} onMouseLeave={tip.hide}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${items.length} releases from ${items[0].tag} to ${items[items.length - 1].tag}${median !== null ? `; median ${Math.round(median)} days apart` : ""}.`}
      >
        <line x1={16} x2={width - 16} y1={axis} y2={axis} className="axis" />
        {x.ticks(Math.max(3, Math.round(width / 140))).map((tick) => (
          <text key={+tick} x={x(tick)} y={height - 8} textAnchor="middle" className="tick">
            {tick.toLocaleDateString(undefined, { month: "short", year: "2-digit" })}
          </text>
        ))}
        {items.map((release, index) => {
          const cx = x(new Date(release.publishedAt));
          const stem = levels[index] * 20 + 16;
          return (
            <motion.g
              key={release.tag}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: t(0.05 * index), duration: t(0.35), ease: EASE }}
              className={`release ${release.prerelease ? "is-pre" : ""}`}
              onMouseMove={(event) =>
                tip.show(
                  event,
                  `${release.name} · ${new Date(release.publishedAt).toLocaleDateString()}${release.prerelease ? " · pre-release" : ""}`,
                )
              }
            >
              <line x1={cx} x2={cx} y1={axis} y2={axis - stem} className="release-stem" />
              <circle cx={cx} cy={axis - stem} r={5} className="release-dot" />
              {showLabel[index] && (
                <a href={release.url} target="_blank" rel="noreferrer">
                  <text x={cx} y={axis - stem - 9} textAnchor="middle" className="release-label">
                    {release.tag.length > 12 ? `${release.tag.slice(0, 11)}…` : release.tag}
                  </text>
                </a>
              )}
            </motion.g>
          );
        })}
      </svg>
      {median !== null && (
        <p className="fine">Median gap between releases: {Math.round(median)} days.</p>
      )}
      {tip.node}
    </div>
  );
}

/* ---------------- Ranked bars (HTML, with avatars) ---------------- */
export type RankRow = {
  key: string;
  label: string;
  value: number;
  avatar?: string | null;
  href?: string;
  detail?: string;
  tone?: "accent" | "ok" | "warn" | "branches";
};
export function RankBars({ rows, unit, label }: { rows: RankRow[]; unit: string; label: string }) {
  const peak = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ol className="rank" aria-label={label}>
      {rows.map((row, index) => (
        <li key={row.key} className={`rank-row tone-${row.tone ?? "accent"}`}>
          <span className="rank-who">
            {row.avatar ? (
              <img src={row.avatar} alt="" width={22} height={22} loading="lazy" referrerPolicy="no-referrer" />
            ) : (
              <span className="rank-initial" aria-hidden="true">
                {row.label.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="rank-names">
              {row.href ? (
                <a href={row.href} target="_blank" rel="noreferrer">
                  {row.label}
                </a>
              ) : (
                <span>{row.label}</span>
              )}
              {row.detail && <small className="rank-detail">{row.detail}</small>}
            </span>
          </span>
          <span className="rank-track" aria-hidden="true">
            <motion.span
              className="rank-fill"
              initial={{ width: 0 }}
              animate={{ width: `${(row.value / peak) * 100}%` }}
              transition={{ delay: t(index * 0.03), duration: t(0.6), ease: EASE }}
            />
          </span>
          <span className="rank-value" title={`${row.value.toLocaleString()} ${unit}`}>
            {row.value.toLocaleString()}
            <span className="rank-unit"> {unit}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ---------------- Code frequency (additions / deletions per week) ---------------- */
export function CodeFrequency({ weeks }: { weeks: CodeWeek[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = 190;
  const top = 12;
  const bottom = 22;
  const left = 44;
  const data = weeks.map((week) => ({ ...week, date: new Date(week.week) }));
  if (!data.length) return null;
  const x = scaleTime()
    .domain([data[0].date, data[data.length - 1].date])
    .range([left, width - 8]);
  const peak = Math.max(1, ...data.map((d) => Math.max(d.additions, d.deletions)));
  const y = scaleSymlog().domain([-peak, peak]).range([height - bottom, top]).constant(10);
  const adds = area<(typeof data)[number]>()
    .x((d) => x(d.date))
    .y0(y(0))
    .y1((d) => y(d.additions))
    .curve(curveMonotoneX);
  const dels = area<(typeof data)[number]>()
    .x((d) => x(d.date))
    .y0(y(0))
    .y1((d) => y(-d.deletions))
    .curve(curveMonotoneX);
  const ticks = [peak, Math.round(peak / 10), 0, -Math.round(peak / 10), -peak].filter(
    (value, index, all) => all.indexOf(value) === index && Math.abs(value) >= 0,
  );
  const fmt = (value: number) =>
    Math.abs(value) >= 1000 ? `${Math.round(Math.abs(value) / 100) / 10}k` : String(Math.abs(value));
  const totalAdd = data.reduce((sum, d) => sum + d.additions, 0);
  const totalDel = data.reduce((sum, d) => sum + d.deletions, 0);
  const point = hover === null ? null : data[hover];
  const find = bisector<(typeof data)[number], Date>((d) => d.date).center;
  return (
    <div className="chart" ref={ref}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Lines changed per week over ${data.length} weeks: ${totalAdd.toLocaleString()} added, ${totalDel.toLocaleString()} removed. Symmetric log scale.`}
        onMouseMove={(event) => {
          const box = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
          setHover(find(data, x.invert(event.clientX - box.left)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((tick) => (
          <g key={tick} transform={`translate(0 ${y(tick)})`}>
            <line x1={left} x2={width - 8} className={tick === 0 ? "axis" : "grid"} />
            <text x={left - 6} y={3} textAnchor="end" className="tick">
              {tick > 0 ? "+" : tick < 0 ? "−" : ""}
              {fmt(tick)}
            </text>
          </g>
        ))}
        {x.ticks(Math.max(3, Math.round(width / 120))).map((tick) => (
          <text key={+tick} x={x(tick)} y={height - 6} textAnchor="middle" className="tick">
            {tick.toLocaleDateString(undefined, { month: "short", year: "2-digit" })}
          </text>
        ))}
        <motion.path
          d={adds(data) ?? ""}
          className="freq-add"
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{ opacity: 1, scaleY: 1 }}
          style={{ originY: `${y(0)}px` }}
          transition={{ duration: t(0.7), ease: EASE }}
        />
        <motion.path
          d={dels(data) ?? ""}
          className="freq-del"
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{ opacity: 1, scaleY: 1 }}
          style={{ originY: `${y(0)}px` }}
          transition={{ duration: t(0.7), delay: t(0.1), ease: EASE }}
        />
        {point && (
          <g className="freq-guide">
            <line x1={x(point.date)} x2={x(point.date)} y1={top} y2={height - bottom} />
            <circle cx={x(point.date)} cy={y(point.additions)} r={3.5} className="dot-add" />
            <circle cx={x(point.date)} cy={y(-point.deletions)} r={3.5} className="dot-del" />
          </g>
        )}
      </svg>
      {point && (
        <div
          className="chart-tip"
          style={{ left: x(point.date), top: Math.min(y(point.additions), height - bottom - 30) }}
          aria-hidden="true"
        >
          Week of {point.date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          {" · "}
          <span className="tip-add">+{point.additions.toLocaleString()}</span>{" "}
          <span className="tip-del">−{point.deletions.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}

/* ---------------- Punch card (day × hour) ---------------- */
export function PunchCard({ punches }: { punches: Punch[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const tip = useTip();
  const left = 34;
  const top = 6;
  const cell = Math.max(12, Math.min(30, (width - left) / 24));
  const height = top + 7 * cell + 20;
  const peak = Math.max(1, ...punches.map((p) => p.count));
  const r = scaleSqrt().domain([0, peak]).range([0, cell * 0.46]);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const busiest = punches.reduce((best, p) => (p.count > best.count ? p : best), punches[0] ?? { day: 0, hour: 0, count: 0 });
  const total = punches.reduce((sum, p) => sum + p.count, 0);
  return (
    <div className="chart" ref={ref} onMouseLeave={tip.hide}>
      <svg
        width={Math.min(width, left + 24 * cell)}
        height={height}
        role="img"
        aria-label={`${total.toLocaleString()} commits by weekday and hour; busiest slot ${days[busiest.day]} ${busiest.hour}:00 with ${busiest.count}.`}
      >
        {days.map((day, index) => (
          <text key={day} x={0} y={top + index * cell + cell / 2 + 4} className="tick">
            {day}
          </text>
        ))}
        {[0, 6, 12, 18, 23].map((hour) => (
          <text key={hour} x={left + hour * cell + cell / 2} y={height - 4} textAnchor="middle" className="tick">
            {hour === 0 ? "12a" : hour === 12 ? "12p" : hour < 12 ? `${hour}a` : `${hour - 12}p`}
          </text>
        ))}
        {punches.map((punch) => (
          <g key={`${punch.day}-${punch.hour}`}>
            <rect
              x={left + punch.hour * cell}
              y={top + punch.day * cell}
              width={cell}
              height={cell}
              className="punch-cell"
              onMouseMove={(event) =>
                tip.show(event, `${days[punch.day]} ${punch.hour}:00–${punch.hour}:59 · ${punch.count} commits`)
              }
            />
            {punch.count > 0 && (
              <motion.circle
                cx={left + punch.hour * cell + cell / 2}
                cy={top + punch.day * cell + cell / 2}
                className="punch-dot"
                initial={{ r: 0 }}
                animate={{ r: r(punch.count) }}
                transition={{ delay: t((punch.day * 24 + punch.hour) * 0.002), duration: t(0.4), ease: EASE }}
                style={{ opacity: 0.35 + 0.65 * (punch.count / peak) }}
                pointerEvents="none"
              />
            )}
          </g>
        ))}
      </svg>
      {tip.node}
    </div>
  );
}
