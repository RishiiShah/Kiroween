import { hierarchy, treemap, treemapSquarify, type HierarchyRectangularNode } from "d3-hierarchy";
import { m } from "motion/react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Finding, Snapshot } from "./scan";
import { ZONES } from "./scan";
import { Icon, t } from "./ui";

type Room = {
  name: string;
  path: string;
  files: number;
  findings: Finding[];
  children: Room[];
};

/** Which file or folder a finding belongs to; commit and branch findings live outside the house. */
export function findingPath(finding: Finding): string | null {
  if (finding.zone !== "unfinished") return null;
  if (finding.path === "/" || finding.path === "") return "";
  return finding.path.replace(/:\d+$/, "");
}

/** Builds a room tree (up to two folder levels) from the scanned file list. */
export function buildRooms(files: string[], findings: Finding[]): Room {
  const root: Room = { name: "/", path: "", files: 0, findings: [], children: [] };
  const child = (parent: Room, name: string, path: string) => {
    let room = parent.children.find((item) => item.name === name);
    if (!room) {
      room = { name, path, files: 0, findings: [], children: [] };
      parent.children.push(room);
    }
    return room;
  };
  const roomFor = (path: string, create: boolean) => {
    const parts = path.split("/");
    if (parts.length === 1) return create ? child(root, "(root files)", "") : root.children.find((r) => r.name === "(root files)") ?? null;
    const top = create ? child(root, parts[0], parts[0]) : root.children.find((r) => r.name === parts[0]);
    if (!top) return null;
    if (parts.length === 2) return create ? child(top, "(files)", parts[0]) : top.children.find((r) => r.name === "(files)") ?? top;
    const sub = `${parts[0]}/${parts[1]}`;
    return create ? child(top, parts[1], sub) : top.children.find((r) => r.path === sub) ?? top;
  };
  for (const file of files) {
    const room = roomFor(file, true)!;
    room.files++;
  }
  for (const finding of findings) {
    const path = findingPath(finding);
    if (path === null) continue;
    const room = path === "" ? child(root, "(root files)", "") : roomFor(path, false) ?? child(root, "(root files)", "");
    room.findings.push(finding);
  }
  return root;
}

const totalFindings = (room: Room): number =>
  room.findings.length + room.children.reduce((sum, item) => sum + totalFindings(item), 0);

export function House({ snapshot, onOpen }: { snapshot: Snapshot; onOpen: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (element.clientWidth) setWidth(element.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => entry.contentRect.width > 0 && setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const height = Math.max(380, Math.min(620, Math.round(width * 0.56)));
  const rooms = useMemo(() => buildRooms(snapshot.files, snapshot.findings), [snapshot]);
  const layout = useMemo(() => {
    const root = hierarchy<Room>(rooms, (room) => (room.children.length ? room.children : undefined))
      .sum((room) => (room.children.length ? 0 : Math.max(room.files, room.findings.length ? 1 : 0)))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return treemap<Room>().tile(treemapSquarify.ratio(1.3)).size([width, height]).paddingOuter(4).paddingTop((node) => (node.depth === 1 ? 24 : 4)).paddingInner(4).round(true)(root);
  }, [rooms, width, height]);

  const haunted = layout
    .descendants()
    .filter((node) => node.data.findings.length > 0)
    .sort((a, b) => b.data.findings.length - a.data.findings.length);
  const outside = snapshot.findings.filter((finding) => findingPath(finding) === null);
  const show = (event: React.MouseEvent | React.FocusEvent, node: HierarchyRectangularNode<Room>) => {
    const box = ref.current!.getBoundingClientRect();
    const x = "clientX" in event ? event.clientX - box.left : (node.x0 + node.x1) / 2;
    const y = "clientY" in event ? event.clientY - box.top : node.y0 + 12;
    const count = totalFindings(node.data);
    setTip({
      x,
      y,
      text: `${node.data.path || "repository root"} · ${node.value ?? 0} files${count ? ` · ${count} ${count === 1 ? "finding" : "findings"}` : ""}`,
    });
  };

  if (!snapshot.files.length)
    return (
      <p className="block-empty bordered">
        The file tree was not available in this snapshot, so there is no floor plan to draw.
      </p>
    );

  return (
    <div className="house">
      <section className="block house-plan" aria-labelledby="house-title">
        <header className="block-head">
          <Icon name="home" size={15} className="block-icon" />
          <h3 id="house-title">Floor plan</h3>
          <span className="block-note">
            {snapshot.files.length.toLocaleString()} files · {layout.children?.length ?? 0} rooms
          </span>
        </header>
        <div className="house-canvas chart" ref={ref} onMouseLeave={() => setTip(null)}>
          <svg
            width={width}
            height={height}
            role="group"
            aria-label={`Floor plan of ${snapshot.repository}: ${layout.children?.length ?? 0} top-level rooms; ${haunted.length} rooms contain findings. The list beside it has the same information.`}
          >
            {layout.descendants().slice(1).map((node, index) => {
              const w = node.x1 - node.x0;
              const h = node.y1 - node.y0;
              const count = totalFindings(node.data);
              const top = node.depth === 1;
              const first = node.data.findings[0] ?? null;
              return (
                <m.g
                  key={`${node.depth}-${node.data.path}-${node.data.name}`}
                  className={`room depth-${node.depth} ${count ? "is-haunted" : ""}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: t(Math.min(index, 40) * 0.012), duration: t(0.35) }}
                  onMouseMove={(event) => show(event, node)}
                  onFocus={(event) => show(event, node)}
                  onBlur={() => setTip(null)}
                  onClick={() => first && onOpen(first.id)}
                  onKeyDown={(event) => {
                    if ((event.key === "Enter" || event.key === " ") && first) {
                      event.preventDefault();
                      onOpen(first.id);
                    }
                  }}
                  tabIndex={first ? 0 : -1}
                  role={first ? "button" : undefined}
                  aria-label={first ? `${node.data.path || "root"}: ${count} findings, open the first` : undefined}
                >
                  <rect x={node.x0} y={node.y0} width={w} height={h} rx={top ? 10 : 6} />
                  {top && w > 46 && (
                    <text x={node.x0 + 10} y={node.y0 + 16} className="room-name">
                      {node.data.name.length > w / 7.5 ? `${node.data.name.slice(0, Math.max(3, Math.floor(w / 7.5) - 1))}…` : node.data.name}
                      <tspan className="room-files"> {node.value}</tspan>
                    </text>
                  )}
                  {!top && w > 54 && h > 30 && (
                    <text x={node.x0 + 7} y={node.y0 + 15} className="room-sub">
                      {node.data.name.length > w / 6.8 ? `${node.data.name.slice(0, Math.max(3, Math.floor(w / 6.8) - 1))}…` : node.data.name}
                    </text>
                  )}
                  {node.data.findings.length > 0 && w > 22 && h > 22 && (
                    <g transform={`translate(${node.x1 - 22} ${node.y1 - 22})`} className="ghost-marker">
                      <path d="M2 16V8a7 7 0 0 1 14 0v8l-2.3-1.7-2.4 1.7L9 14.3l-2.3 1.7-2.4-1.7z" />
                      <circle cx="6.6" cy="8" r="1.3" />
                      <circle cx="11.4" cy="8" r="1.3" />
                      {node.data.findings.length > 1 && (
                        <text x={9} y={-3} textAnchor="middle" className="ghost-count">
                          {node.data.findings.length}
                        </text>
                      )}
                    </g>
                  )}
                </m.g>
              );
            })}
          </svg>
          {tip && (
            <div className="chart-tip" style={{ left: tip.x, top: tip.y }} aria-hidden="true">
              {tip.text}
            </div>
          )}
        </div>
        <p className="legend house-legend">
          <span><i className="legend-swatch house-room" /> Room (folder), sized by file count</span>
          <span><i className="legend-swatch house-haunted" /> Haunted: holds a finding — click to open it</span>
        </p>
      </section>

      <aside className="block house-side" aria-labelledby="haunted-title">
        <header className="block-head">
          <Icon name="ghost" size={15} className="block-icon" />
          <h3 id="haunted-title">Haunted rooms</h3>
          <span className="block-note">{haunted.length}</span>
        </header>
        {haunted.length ? (
          <ul className="attention-list">
            {haunted.map((node) =>
              node.data.findings.map((finding) => (
                <li key={finding.id}>
                  <button onClick={() => onOpen(finding.id)}>
                    <span className={`group-icon z-${finding.zone}`} aria-hidden="true">
                      <Icon name={ZONES.find((zone) => zone.id === finding.zone)!.icon} size={14} />
                    </span>
                    <span className="att-main">
                      <span className="att-title">{finding.title}</span>
                      <span className="att-path">{node.data.path || "repository root"}</span>
                    </span>
                    <Icon name="next" size={14} className="att-go" />
                  </button>
                </li>
              )),
            )}
          </ul>
        ) : (
          <p className="block-empty">No file-level findings in this sample.</p>
        )}
        {outside.length > 0 && (
          <p className="fine house-outside">
            Outside the house: {outside.filter((f) => f.zone === "activity").length} recent commits and{" "}
            {outside.filter((f) => f.zone === "branches").length} branches are not tied to a single
            file, so they appear on the findings board instead.
          </p>
        )}
      </aside>
    </div>
  );
}
