// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import recordedDemo from "../public/demo-snapshot.json";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { App } from "../src/App";
import type { Snapshot } from "../src/scan";
import { reviewKey } from "../src/reviews";

const demo = recordedDemo as Snapshot;
let root: Root;
let container: HTMLDivElement;
async function mountRaw() {
  await act(async () => {
    root.render(<App />);
  });
}
async function mount() {
  await mountRaw();
  await click("Findings");
}
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find(
    (element) => element.textContent?.trim() === label,
  );
  expect(button, `button ${label}`).toBeTruthy();
  await act(async () => button!.click());
}
async function expand(label: string) {
  const summary = [...container.querySelectorAll("summary")].find(
    (element) => element.textContent?.trim() === label,
  );
  expect(summary).toBeTruthy();
  await act(
    async () => ((summary!.parentElement as HTMLDetailsElement).open = true),
  );
}
async function openFirstTrace() {
  await act(async () =>
    container.querySelector<HTMLButtonElement>(".trace")!.click(),
  );
}
async function loadReportFile(value: unknown) {
  const json = JSON.stringify(value);
  const input =
    container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [{ size: json.length, text: async () => json }],
  });
  await act(async () =>
    input.dispatchEvent(new Event("change", { bubbles: true })),
  );
}
beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  window.location.hash = "#/dashboard";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(demo))),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event("close"));
    },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  vi.useRealTimers();
});
describe("explorer interactions", () => {
  it("loads the recorded demo and opens immutable source evidence", async () => {
    await mount();
    expect(container.textContent).toContain("BUNDLED DEMO");
    expect(container.querySelectorAll(".trace").length).toBe(
      demo.findings.length,
    );
    expect(container.querySelector(".inspector")).toBeNull();
    expect(container.querySelectorAll("details[open]")).toHaveLength(0);
    const finding = demo.findings.find((f) => f.zone === "unfinished")!;
    const trace = [
      ...container.querySelectorAll<HTMLButtonElement>(".trace"),
    ].find((button) => button.textContent?.includes(finding.title))!;
    await act(async () => trace.click());
    expect(
      container.querySelector<HTMLAnchorElement>(".source-button")?.href,
    ).toBe(finding.source);
    expect(container.querySelector(".inspector h3")?.textContent).toBe(
      finding.title,
    );
  });
  it("filters categories, switches views, and preserves evidence links", async () => {
    await mount();
    await expand("Filters");
    const category = container.querySelector<HTMLSelectElement>(
      '[aria-label="Finding category"]',
    )!;
    await act(async () => {
      category.value = "branches";
      category.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelectorAll(".trace").length).toBe(
      demo.findings.filter((f) => f.zone === "branches").length,
    );
    await click("Analyst table");
    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBe(
      demo.findings.filter((f) => f.zone === "branches").length,
    );
    for (const row of rows)
      expect(row.querySelector("a")?.getAttribute("href")).toMatch(
        /^https:\/\/github.com\//,
      );
    const search = container.querySelector<HTMLInputElement>(
      '[aria-label="Filter findings"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(search, "this-string-matches-no-traces");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
    expect(container.textContent).toContain("No matching findings");
    expect(container.querySelector(".inspector")).toBeNull();
  });
  it("restores a valid cache and deletes it on request", async () => {
    localStorage.setItem("poltergeist.snapshot.v1", JSON.stringify(demo));
    await mount();
    expect(container.textContent).toContain("CACHED SNAPSHOT");
    await expand("Settings");
    await click("Clear saved scan");
    expect(localStorage.getItem("poltergeist.snapshot.v1")).toBeNull();
    expect(container.textContent).toContain("Saved scan deleted");
  });
  it("navigates only visible traces and preserves source ownership", async () => {
    await mount();
    await expand("Filters");
    const status = container.querySelector<HTMLSelectElement>(
      '[aria-label="Filter finding status"]',
    )!;
    await act(async () => {
      status.value = "review";
      status.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const traces = [...container.querySelectorAll<HTMLButtonElement>(".trace")];
    await act(async () => traces[0].click());
    expect(
      container.querySelector('[aria-label="Trace navigation"]')?.textContent,
    ).toContain(`Trace 1 of ${traces.length}`);
    await click("Next trace");
    const finding = demo.findings.find((f) =>
      traces[1].textContent?.includes(f.title),
    )!;
    expect(
      container.querySelector(".source-button")?.getAttribute("href"),
    ).toBe(finding.source);
    await click("Previous trace");
    expect(
      container.querySelector('[aria-label="Trace navigation"]')?.textContent,
    ).toContain(`Trace 1 of ${traces.length}`);
  });
  it("provides explicit motion control and audio failure fallback", async () => {
    await mount();
    await expand("Settings");
    await click("Reduce motion");
    expect(container.querySelector(".motion-paused")).toBeTruthy();
    await click("Motion reduced");
    expect(container.querySelector(".motion-paused")).toBeNull();
    vi.stubGlobal("AudioContext", undefined);
    await click("Enable ambience");
    expect(container.textContent).toContain("Audio is unavailable");
    expect(container.querySelectorAll(".trace")).toHaveLength(
      demo.findings.length,
    );
  });
  it("combines status and text filters in both views and resets for the demo", async () => {
    await mount();
    await expand("Filters");
    const status = container.querySelector<HTMLSelectElement>(
      '[aria-label="Filter finding status"]',
    )!;
    await act(async () => {
      status.value = "review";
      status.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const reviews = demo.findings.filter((f) => f.severity === "review");
    expect(container.querySelectorAll(".trace")).toHaveLength(reviews.length);
    await click("Analyst table");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(reviews.length);
    const search = container.querySelector<HTMLInputElement>(
      '[aria-label="Filter findings"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(search, reviews[0].title);
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(container.querySelector("tbody tr a")?.getAttribute("href")).toBe(
      reviews[0].source,
    );
    await click("Explore the demo");
    expect(
      container.querySelector<HTMLSelectElement>(
        '[aria-label="Filter finding status"]',
      )!.value,
    ).toBe("all");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(
      demo.findings.length,
    );
  });
  it("keeps previous results after live scan failure", async () => {
    await mount();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 })),
    );
    await act(async () =>
      container
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Only accessible public repositories",
    );
    expect(container.querySelectorAll(".trace").length).toBe(
      demo.findings.length,
    );
  });
  it("changes theme without removing evidence", async () => {
    await mount();
    await openFirstTrace();
    const source = container
      .querySelector(".source-button")
      ?.getAttribute("href");
    await click("Close evidence");
    await expand("Settings");
    expect(container.querySelector(".app.theme-halloween")).toBeTruthy();
    await click("Dark");
    expect(container.querySelector(".app.theme-dark")).toBeTruthy();
    expect(localStorage.getItem("poltergeist.theme.v1")).toBe("dark");
    await openFirstTrace();
    expect(
      container.querySelector(".source-button")?.getAttribute("href"),
    ).toBe(source);
  });
  it("renders untrusted repository text without creating script elements", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ...demo,
              description: '<script>throw new Error("injected")</script>',
            }),
          ),
      ),
    );
    await mount();
    expect(container.textContent).toContain("<script>");
    expect(container.querySelector("script")).toBeNull();
  });
  it("autosaves review notes, restores them, and filters reviewed findings", async () => {
    vi.useFakeTimers();
    await mount();
    await openFirstTrace();
    const source = container
      .querySelector(".source-button")!
      .getAttribute("href");
    const finding = demo.findings.find((f) => f.source === source)!;
    const key = reviewKey(demo.repository, finding);
    await expand("Review & notes");
    const note = container.querySelector<HTMLTextAreaElement>(
      '[aria-label="Investigation note"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(note, "Ask maintainer before archiving.");
      note.dispatchEvent(new Event("input", { bubbles: true }));
      container
        .querySelector<HTMLInputElement>(".review-checkbox input")!
        .click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(
      JSON.parse(localStorage.getItem("poltergeist.reviews.v1")!)[key],
    ).toEqual({ note: "Ask maintainer before archiving.", reviewed: true });
    await click("Close evidence");
    await expand("Filters");
    const status = container.querySelector<HTMLSelectElement>(
      '[aria-label="Filter finding status"]',
    )!;
    await act(async () => {
      status.value = "reviewed";
      status.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelectorAll(".trace")).toHaveLength(1);
    await act(async () => root.render(null));
    await mount();
    await openFirstTrace();
    expect(
      container.querySelector<HTMLTextAreaElement>(
        '[aria-label="Investigation note"]',
      )!.value,
    ).toBe("Ask maintainer before archiving.");
    expect(
      container.querySelector<HTMLInputElement>(".review-checkbox input")!
        .checked,
    ).toBe(true);
  });
  it("imports reports offline and preserves existing notes over imported conflicts", async () => {
    const key = reviewKey(demo.repository, demo.findings[0]);
    localStorage.setItem(
      "poltergeist.reviews.v1",
      JSON.stringify({ [key]: { note: "Local work", reviewed: false } }),
    );
    await mount();
    const fetcher = vi.mocked(fetch);
    fetcher.mockClear();
    const fileInput =
      container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const json = JSON.stringify({
      ...demo,
      localReviews: { [key]: { note: "Older backup", reviewed: true } },
    });
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [{ size: json.length, text: async () => json }],
    });
    await act(async () =>
      fileInput.dispatchEvent(new Event("change", { bubbles: true })),
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(container.textContent).toContain("IMPORTED REPORT");
    const trace = [
      ...container.querySelectorAll<HTMLButtonElement>(".trace"),
    ].find((button) => button.textContent?.includes(demo.findings[0].title))!;
    await act(async () => trace.click());
    expect(
      container.querySelector<HTMLTextAreaElement>(
        '[aria-label="Investigation note"]',
      )!.value,
    ).toBe("Local work");
    expect(
      container.querySelector<HTMLInputElement>(".review-checkbox input")!
        .checked,
    ).toBe(false);
  });
  it("rejects oversized imports without reading them or replacing results", async () => {
    await mount();
    const read = vi.fn(async () => "{}");
    const fileInput =
      container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [{ size: 3 * 1024 * 1024, text: read }],
    });
    await act(async () =>
      fileInput.dispatchEvent(new Event("change", { bubbles: true })),
    );
    expect(read).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "2 MiB",
    );
    expect(container.querySelectorAll(".trace")).toHaveLength(
      demo.findings.length,
    );
  });
  it("preserves unreadable saved notes and exports new session notes safely", async () => {
    vi.useFakeTimers();
    localStorage.setItem("poltergeist.reviews.v1", "broken existing data");
    await mount();
    await openFirstTrace();
    await expand("Review & notes");
    const note = container.querySelector<HTMLTextAreaElement>(
      '[aria-label="Investigation note"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(note, "<script>session only</script>");
      note.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(localStorage.getItem("poltergeist.reviews.v1")).toBe(
      "broken existing data",
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("Export a report to keep a copy");
  });
  it("compares a baseline without replacing current findings or notes", async () => {
    await mount();
    await expand("Report");
    await click("Compare snapshot");
    const baseline = structuredClone(demo);
    baseline.findings[0].title = "Earlier observation";
    baseline.findings.pop();
    baseline.findings.push({ ...baseline.findings[0], id: "baseline-only" });
    vi.mocked(fetch).mockClear();
    await loadReportFile(baseline);
    expect(fetch).not.toHaveBeenCalled();
    const panel = container.querySelector(
      '[aria-label="Snapshot comparison"]',
    )!;
    expect(panel.textContent).toContain("New in sample (1)");
    expect(panel.textContent).toContain("Changed observations (1)");
    expect(panel.textContent).toContain("Not seen in current sample (1)");
    expect(panel.textContent).toContain(
      "does not establish that a problem was fixed",
    );
    expect(localStorage.getItem("poltergeist.reviews.v1")).toBeNull();
    expect(container.querySelectorAll(".trace")).toHaveLength(
      demo.findings.length,
    );
    await click("Close comparison");
    expect(
      container.querySelector('[aria-label="Snapshot comparison"]'),
    ).toBeNull();
  });
  it("rejects comparison across different branches without changing results", async () => {
    await mount();
    await expand("Report");
    await click("Compare snapshot");
    await loadReportFile({ ...demo, defaultBranch: "other-branch" });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "same default branch",
    );
    expect(
      container.querySelector('[aria-label="Snapshot comparison"]'),
    ).toBeNull();
    expect(container.querySelectorAll(".trace")).toHaveLength(
      demo.findings.length,
    );
  });
  it("opens native printing with a full source-linked report and escaped notes", async () => {
    const key = reviewKey(demo.repository, demo.findings[0]);
    localStorage.setItem(
      "poltergeist.reviews.v1",
      JSON.stringify({
        [key]: { note: "<script>review context</script>", reviewed: true },
      }),
    );
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    await mount();
    await expand("Report");
    await click("Print full report");
    expect(print).toHaveBeenCalledOnce();
    const report = container.querySelector(".print-report")!;
    expect(report.querySelectorAll(".print-finding")).toHaveLength(
      demo.findings.length,
    );
    expect(report.querySelectorAll("a")).toHaveLength(demo.findings.length);
    expect(report.textContent).toContain("<script>review context</script>");
    expect(report.textContent).toContain("Reviewed locally");
    expect(report.querySelector("script")).toBeNull();
    expect(report.querySelector("button")).toBeNull();
  });
  it("ignores a baseline file if the user changes snapshots while it is being read", async () => {
    localStorage.setItem("poltergeist.snapshot.v1", JSON.stringify(demo));
    await mount();
    await expand("Report");
    await click("Compare snapshot");
    let finish!: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [{ size: 100, text: () => pending }],
    });
    await act(async () =>
      input.dispatchEvent(new Event("change", { bubbles: true })),
    );
    await click("Explore the demo");
    await act(async () => {
      finish(JSON.stringify(demo));
      await pending;
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Snapshot changed while reading",
    );
    expect(
      container.querySelector('[aria-label="Snapshot comparison"]'),
    ).toBeNull();
    expect(container.textContent).toContain("BUNDLED DEMO");
  });

  it("opens on an overview whose entries point at real evidence", async () => {
    await mountRaw();
    expect(container.querySelector(".overview")).toBeTruthy();
    expect(container.querySelectorAll(".trace")).toHaveLength(0);
    const first = container.querySelector<HTMLButtonElement>(
      ".attention-list button",
    )!;
    await act(async () => first.click());
    const finding = demo.findings.find(
      (f) => f.severity === "review" && first.textContent?.includes(f.title),
    )!;
    expect(
      container.querySelector(".source-button")?.getAttribute("href"),
    ).toBe(finding.source);
    await click("Close evidence");
    expect(container.querySelector(".inspector")).toBeNull();
    const group = container.querySelector<HTMLButtonElement>(".group-list li:nth-child(2) button")!;
    await act(async () => group.click());
    const traces = [...container.querySelectorAll(".trace")];
    expect(traces.length).toBe(demo.findings.filter((f) => f.zone === "branches").length);
  });

  it("auto-loads issues and pull requests once, splits them, and loads comments on request", async () => {
    const item = (number: number, extra: Record<string, unknown> = {}) => ({
      number,
      title: `Haunted hinge ${number}`,
      user: { login: "casper" },
      comments: number === 2 ? 1 : 0,
      labels: [{ name: "spooky" }],
      created_at: "2026-11-01T00:00:00Z",
      updated_at: "2026-11-10T00:00:00Z",
      body: "<img src=x onerror=alert(1)> body",
      ...extra,
    });
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        calls.push(input);
        if (input.includes("/comments"))
          return new Response(
            JSON.stringify([
              { id: 9, user: { login: "boo" }, created_at: "2026-11-11T00:00:00Z", body: "<script>x</script> seen" },
            ]),
          );
        if (input.includes("/issues?"))
          return new Response(
            JSON.stringify([item(1), item(2, { pull_request: {} }), item(3), item(4, { pull_request: {}, draft: true })]),
          );
        return new Response(JSON.stringify(demo));
      }),
    );
    await mountRaw();
    const issueCalls = () => calls.filter((c) => c.includes("/issues?"));
    expect(issueCalls()).toHaveLength(1);
    expect(issueCalls()[0]).toContain("per_page=100");
    const navCount = (label: string) =>
      [...container.querySelectorAll<HTMLButtonElement>(".nav-item")]
        .find((b) => b.textContent?.trim() === label)
        ?.getAttribute("data-count");
    expect(navCount("Issues")).toBe("2");
    expect(navCount("Pull requests")).toBe("2");
    expect(container.querySelector(".threads")?.textContent).toContain("Haunted hinge 4");
    await click("Issues");
    expect(container.querySelectorAll(".issue")).toHaveLength(2);
    expect(container.querySelector(".issue-list")?.textContent).not.toContain("Haunted hinge 2");
    await click("Pull requests");
    expect(container.querySelectorAll(".issue")).toHaveLength(2);
    expect(container.querySelector(".issue-list")?.textContent).toContain("Draft pull request");
    expect(issueCalls()).toHaveLength(1);
    const pr = [...container.querySelectorAll<HTMLElement>(".issue-title")].find((e) =>
      e.textContent?.includes("Haunted hinge 2"),
    )!;
    await act(async () => pr.click());
    expect(container.querySelector(".issue-excerpt")?.textContent).toContain("<img src=x");
    expect(container.querySelector(".issue-detail img")).toBeNull();
    expect(
      container.querySelector<HTMLAnchorElement>(".issue-actions a")?.getAttribute("href"),
    ).toBe("https://github.com/expressjs/express/pull/2");
    expect(calls.filter((c) => c.includes("/comments"))).toHaveLength(0);
    await click("Load comments · 1 request");
    expect(container.querySelector(".comment-list")?.textContent).toContain("<script>x</script> seen");
    expect(container.querySelector(".comment-list script")).toBeNull();
    expect(calls.filter((c) => c.includes("/comments"))).toHaveLength(1);
  });

  it("opens a thread from the overview in the matching view", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) =>
        input.includes("/issues?")
          ? new Response(
              JSON.stringify([
                {
                  number: 7,
                  title: "Creaky stair",
                  user: { login: "a" },
                  comments: 0,
                  labels: [],
                  created_at: "2026-11-01T00:00:00Z",
                  updated_at: "2026-11-02T00:00:00Z",
                  body: "creak",
                  pull_request: {},
                },
              ]),
            )
          : new Response(JSON.stringify(demo)),
      ),
    );
    await mountRaw();
    const thread = container.querySelector<HTMLButtonElement>(".thread-list button")!;
    await act(async () => thread.click());
    expect(container.querySelector(".issue-detail h3")?.textContent).toBe("Creaky stair");
    expect(container.querySelector(".view-head h2")?.textContent).toBe("Pull requests");
  });

  it("keeps imported reports offline until asked", async () => {
    await mountRaw();
    vi.mocked(fetch).mockClear();
    const other = { ...demo, repository: "octo/manor", findings: demo.findings.map((f) => ({ ...f, source: f.source.replace("expressjs/express", "octo/manor") })) };
    await expand("Report");
    await click("Import report");
    await loadReportFile(other);
    expect(container.textContent).toContain("IMPORTED REPORT");
    expect(fetch).not.toHaveBeenCalled();
    await click("Issues");
    expect(container.textContent).toContain("Imported reports stay offline");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts owner/repo shorthand and closes evidence with Escape", async () => {
    await mount();
    await openFirstTrace();
    expect(container.querySelector(".inspector")).toBeTruthy();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(container.querySelector(".inspector")).toBeNull();
    const input = container.querySelector<HTMLInputElement>("#repo-url")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "octo/manor",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: string) => {
        calls.push(request);
        return new Response("{}", { status: 404 });
      }),
    );
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(calls[0]).toBe("https://api.github.com/repos/octo/manor");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "unavailable",
    );
  });

  it("shows a readable error when GitHub limits issue loading", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) =>
        input.includes("/issues?")
          ? new Response("{}", { status: 403 })
          : new Response(JSON.stringify(demo)),
      ),
    );
    await mountRaw();
    await click("Issues");
    expect(container.textContent).toContain("Try again · 1 request");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("limited");
    expect(container.querySelectorAll(".issue")).toHaveLength(0);
  });

  it("defaults to Halloween, restores saved themes, and ignores bad values", async () => {
    localStorage.setItem("poltergeist.theme.v1", "midnight");
    await mountRaw();
    expect(container.querySelector(".app.theme-midnight")).toBeTruthy();
    await expand("Settings");
    await click("High contrast");
    expect(container.querySelector(".app.theme-contrast.is-dark")).toBeTruthy();
    await click("Light");
    expect(container.querySelector(".app.theme-light")).toBeTruthy();
    expect(container.querySelector(".app.is-dark")).toBeNull();
    await click("Match system");
    expect(container.querySelector(".app.theme-light")).toBeTruthy();
    await click("Halloween");
    expect(localStorage.getItem("poltergeist.theme.v1")).toBeNull();
    await act(async () => root.unmount());
    root = createRoot(container);
    localStorage.setItem("poltergeist.theme.v1", "<script>");
    await mountRaw();
    expect(container.querySelector(".app.theme-halloween")).toBeTruthy();
  });

  it("opens the command palette with Ctrl+K and runs commands", async () => {
    Element.prototype.scrollIntoView ??= function () {};
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    await mountRaw();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    });
    expect(document.querySelector(".palette")).toBeTruthy();
    const items = [...document.querySelectorAll<HTMLElement>("[cmdk-item]")];
    expect(items.filter((item) => demo.findings.some((f) => item.textContent?.includes(f.title))).length).toBe(
      demo.findings.length,
    );
    const table = items.find((item) => item.textContent?.includes("Analyst table"))!;
    await act(async () => table.click());
    expect(document.querySelector(".palette")).toBeNull();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(demo.findings.length);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
    });
    const finding = demo.findings[0];
    const open = [...document.querySelectorAll<HTMLElement>("[cmdk-item]")].find((item) =>
      item.textContent?.includes(finding.title),
    )!;
    await act(async () => open.click());
    expect(container.querySelector(".source-button")?.getAttribute("href")).toBe(finding.source);
  });

  it("steps through visible findings with J and K, but not while typing", async () => {
    await mount();
    const press = (key: string, target: EventTarget = document) =>
      act(async () => {
        target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      });
    await press("j");
    const nav = () => container.querySelector('[aria-label="Trace navigation"]')?.textContent;
    expect(nav()).toContain(`Trace 1 of ${demo.findings.length}`);
    await press("j");
    expect(nav()).toContain("Trace 2 of");
    await press("k");
    expect(nav()).toContain("Trace 1 of");
    const search = container.querySelector<HTMLInputElement>('[aria-label="Filter findings"]')!;
    await press("j", search);
    expect(nav()).toContain("Trace 1 of");
  });

  it("draws icons from the active theme's set without changing labels", async () => {
    await mountRaw();
    const overview = () =>
      [...container.querySelectorAll<HTMLButtonElement>(".nav-item")].find(
        (b) => b.textContent?.trim() === "Overview",
      )!;
    expect(overview().querySelector('svg[data-glyph="castle-turret"][data-weight="duotone"]')).toBeTruthy();
    await expand("Settings");
    await click("Light");
    expect(overview().querySelector('svg[data-glyph="squares-four"]')).toBeTruthy();
    await click("Midnight");
    expect(overview().querySelector('svg[data-glyph="planet"][data-weight="light"]')).toBeTruthy();
    await click("High contrast");
    expect(overview().querySelector("svg")?.getAttribute("data-weight")).toBe("bold");
    expect(overview().textContent?.trim()).toBe("Overview");
  });

  it("closes menus on outside click and Escape, and keeps one menu open at a time", async () => {
    await mount();
    const menu = (label: string) =>
      [...container.querySelectorAll("summary")].find((el) => el.textContent?.trim() === label)!
        .parentElement as HTMLDetailsElement;
    const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve)));
    await expand("Settings");
    await act(async () => {
      menu("Settings").querySelector("button")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(menu("Settings").open).toBe(true);
    await act(async () => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(menu("Settings").open).toBe(false);

    await expand("Report");
    await settle();
    await expand("Filters");
    await settle();
    expect(menu("Filters").open).toBe(true);
    expect(menu("Report").open).toBe(false);

    await openFirstTrace();
    await expand("Settings");
    await settle();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(menu("Settings").open).toBe(false);
    expect(container.querySelector(".inspector")).toBeTruthy();
    expect(document.activeElement?.textContent?.trim()).toBe("Settings");

    await expand("Report");
    await click("Export report");
    expect(menu("Report").open).toBe(false);
  });

  it("plots findings, branch ages, and commits from the snapshot itself", async () => {
    await mountRaw();
    const branchCount = demo.findings.filter((f) => f.zone === "branches").length;
    expect(container.querySelectorAll(".bar-row")).toHaveLength(branchCount);
    const chart = container.querySelector('[aria-label^="Branch tip age"]')!;
    for (const finding of demo.findings.filter((f) => f.zone === "branches"))
      expect(chart.getAttribute("aria-label")).toContain(finding.path);
    expect(container.querySelectorAll(".donut-slice").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".timeline-dot")).toHaveLength(
      demo.findings.filter((f) => f.zone === "activity").length,
    );
    const quiet = container.querySelector<SVGGElement>(".bar-row.is-quiet")!;
    await act(async () => quiet.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector(".inspector h3")?.textContent).toMatch(/quiet/);
  });

  it("starts on the home page and opens the dashboard only on request", async () => {
    window.location.hash = "";
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        calls.push(input);
        return new Response(JSON.stringify(demo));
      }),
    );
    await mountRaw();
    expect(container.querySelector("#home-title")).toBeTruthy();
    expect(container.querySelector(".sidebar")).toBeNull();
    expect(calls.filter((c) => c.includes("api.github.com"))).toHaveLength(0);
    await click("Open the demo dashboard");
    expect(window.location.hash).toBe("#/dashboard");
    expect(container.querySelector(".sidebar")).toBeTruthy();
    expect(container.textContent).toContain("BUNDLED DEMO");
    expect(calls.filter((c) => c.includes("api.github.com")).length).toBeGreaterThan(0);
    await act(async () => {
      window.location.hash = "#/";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(container.querySelector("#home-title")).toBeTruthy();
  });

  it("offers to resume a saved scan and lists recent scans on the home page", async () => {
    window.location.hash = "";
    const saved = { ...demo, repository: "octo/manor", findings: demo.findings.map((f) => ({ ...f, source: f.source.replace("expressjs/express", "octo/manor") })) };
    localStorage.setItem("poltergeist.snapshot.v1", JSON.stringify(saved));
    localStorage.setItem(
      "poltergeist.history.v1",
      JSON.stringify([
        { repository: "octo/manor", observedAt: demo.observedAt, findings: 3, review: 1 },
        { repository: "ghost/house", observedAt: demo.observedAt, findings: 5, review: 2 },
        { repository: "<script>/x", observedAt: demo.observedAt, findings: 1, review: 1 },
      ]),
    );
    await mountRaw();
    const cards = [...container.querySelectorAll(".recent-card")];
    expect(cards.map((c) => c.querySelector("strong")?.textContent)).toEqual(["octo/manor", "ghost/house"]);
    expect(cards[0].textContent).toContain("Saved scan");
    await act(async () => (cards[0] as HTMLButtonElement).click());
    expect(container.querySelector(".crumb-repo")?.textContent).toContain("manor");
  });

  it("shows people from commits and open threads", async () => {
    const withPeople = {
      ...demo,
      commits: [
        { sha: "a".repeat(40), date: "2026-11-01T00:00:00Z", author: "ann", login: "ann", avatarId: 5 },
        { sha: "b".repeat(40), date: "2026-11-02T00:00:00Z", author: "ann", login: "ann", avatarId: 5 },
        { sha: "c".repeat(40), date: "2026-11-03T00:00:00Z", author: "Bob", login: null, avatarId: null },
      ],
    };
    localStorage.setItem("poltergeist.snapshot.v1", JSON.stringify(withPeople));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) =>
        input.includes("/issues?")
          ? new Response(
              JSON.stringify([
                {
                  number: 11,
                  title: "Fix the cellar door",
                  user: { login: "newbie", id: 77 },
                  author_association: "FIRST_TIME_CONTRIBUTOR",
                  assignees: [{ login: "keeper", id: 8 }],
                  comments: 0,
                  labels: [],
                  created_at: "2026-10-01T00:00:00Z",
                  updated_at: "2026-10-02T00:00:00Z",
                  pull_request: {},
                },
              ]),
            )
          : new Response(JSON.stringify(input.includes("api.github.com") ? [] : withPeople)),
      ),
    );
    await mountRaw();
    await click("People");
    const text = container.querySelector(".people-view")?.textContent ?? "";
    expect(text).toContain("Fix the cellar door");
    expect(text).toContain("keeper");
    expect(text).toContain("ann");
    const avatar = container.querySelector<HTMLImageElement>(".people-view img");
    expect(avatar?.getAttribute("src")).toMatch(/^https:\/\/avatars\.githubusercontent\.com\/u\/\d+\?s=\d+&v=4$/);
    expect(avatar?.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("draws a commit graph with branch labels and loads one commit's files on selection", async () => {
    const hex = (n: number) => n.toString(16).padStart(40, "0");
    const commit = (n: number, parents: number[], message: string) => ({
      sha: hex(n),
      parents: parents.map((p) => ({ sha: hex(p) })),
      author: { login: "ann", id: 4 },
      commit: { message, author: { name: "Ann" }, committer: { date: `2026-11-${String(10 + n).padStart(2, "0")}T00:00:00Z` } },
    });
    const branchTip = demo.findings.find((f) => f.zone === "branches")!.source.split("/commit/")[1];
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        calls.push(input);
        if (input.includes(`/commits?sha=${branchTip}`))
          return new Response(JSON.stringify([{ ...commit(9, [1], "feat: side quest"), sha: branchTip }]));
        if (input.includes("/commits?sha="))
          return new Response(JSON.stringify([commit(3, [2, 1], "Merge pull request #1"), commit(2, [1], "fix: hinge"), commit(1, [], "docs: start")]));
        if (input.includes(`/commits/${hex(3)}`))
          return new Response(JSON.stringify({ commit: { message: "Merge pull request #1\n\nfrom ann/hinge" }, stats: { additions: 4, deletions: 1 }, files: [{ filename: "lib/door.js", status: "modified", additions: 4, deletions: 1 }] }));
        if (input.includes("/stats/punch_card")) return new Response(JSON.stringify([[1, 9, 3]]));
        if (input.includes("/stats/code_frequency")) return new Response(JSON.stringify([[1700000000, 10, -2]]));
        return new Response(JSON.stringify(input.includes("api.github.com") ? [] : demo));
      }),
    );
    await mountRaw();
    await click("Commits");
    const rows = container.querySelectorAll(".graph-row");
    expect(rows).toHaveLength(4);
    expect(container.querySelector(".ref-head")?.textContent).toContain(demo.defaultBranch);
    expect(container.querySelectorAll(".node.is-merge")).toHaveLength(1);
    expect(calls.filter((c) => c.includes("/commits?sha="))).toHaveLength(1 + Math.min(4, demo.findings.filter((f) => f.zone === "branches").length));
    const merge = [...container.querySelectorAll<HTMLButtonElement>(".graph-hit")].find((b) =>
      b.textContent?.includes("Merge pull request"),
    )!;
    await act(async () => merge.click());
    expect(calls.filter((c) => c.includes(`/commits/${hex(3)}`))).toHaveLength(1);
    expect(container.querySelector(".file-path")?.getAttribute("href")).toBe(
      `https://github.com/expressjs/express/blob/${hex(3)}/lib/door.js`,
    );
    expect(container.querySelector(".commit-body")?.textContent).toContain("from ann/hinge");
    expect(container.querySelectorAll(".punch-dot")).toHaveLength(1);
    const search = container.querySelector<HTMLInputElement>('[aria-label="Highlight commits"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "hinge");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelectorAll(".graph-row:not(.is-dim)")).toHaveLength(1);
  });

  it("keeps a reserve for scans: loads cheap threads, pauses costlier details when quota is low", async () => {
    const { recordQuota } = await import("../src/quota");
    recordQuota(
      new Headers({
        "x-ratelimit-remaining": "12",
        "x-ratelimit-limit": "60",
        "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 1200),
      }),
    );
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        calls.push(input);
        if (input.includes("/issues?")) return new Response("[]");
        return new Response(JSON.stringify(demo));
      }),
    );
    await mountRaw();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(calls.filter((c) => c.includes("/issues?"))).toHaveLength(1);
    expect(calls.some((c) => c.includes("/languages") || c.includes("/contributors"))).toBe(false);
    expect(container.textContent).toContain("Paused automatic loading to save quota");
  });
});
