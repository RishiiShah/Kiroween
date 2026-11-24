// Accessibility audit: axe-core on the main screens (GitHub responses replayed from the
// screenshot recording; /rate_limit answered locally). Exits non-zero on serious/critical issues.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const base = process.env.BASE_URL ?? "http://127.0.0.1:4178";
const har = ".screens/github.har";
const browser = await chromium.launch();
let failures = 0;
async function audit(theme, label, prepare) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route(/api\.github\.com\/rate_limit$/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: '{"resources":{"core":{"limit":60,"remaining":48,"reset":9999999999}}}' }),
  );
  await context.routeFromHAR(har, { url: /api\.github\.com\/repos/, notFound: "abort" });
  await context.addInitScript((value) => { if (value !== "halloween") localStorage.setItem("poltergeist.theme.v1", value); }, theme);
  const page = await context.newPage();
  await prepare(page);
  await page.waitForTimeout(2200);
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  failures += serious.length;
  console.log(`\n${theme} · ${label}: ${result.violations.length} issues (${serious.length} serious/critical)`);
  for (const v of result.violations)
    console.log(`  [${v.impact}] ${v.id}: ${v.help} — ${v.nodes.length} node(s): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  await context.close();
}
const demo = async (page, view) => {
  await page.goto(`${base}/#/dashboard?demo=1${view ? `&view=${view}` : ""}`);
  await page.waitForSelector(".view-head");
};
const themes = (process.env.THEMES ?? "halloween,light,dark,midnight,contrast").split(",");
for (const theme of themes) {
  await audit(theme, "home", (page) => page.goto(`${base}/#/`));
  for (const view of ["", "people", "commits", "issues", "pulls", "map", "house", "compare", "table"])
    await audit(theme, view || "overview", (page) => demo(page, view));
}
await browser.close();
console.log(`\nSerious/critical issues: ${failures}`);
process.exit(failures ? 1 : 0);
