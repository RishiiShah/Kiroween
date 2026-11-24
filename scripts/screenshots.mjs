// Visual QA: captures key screens with Playwright. GitHub responses are recorded once to a HAR
// file and replayed afterwards, so repeated runs do not spend API quota.
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";

const base = process.env.BASE_URL ?? "http://127.0.0.1:4178";
const out = process.env.OUT ?? ".screens";
const har = `${out}/github.har`;
const only = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
async function session(viewport, theme = "halloween") {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: "dark" });
  // /rate_limit is free; answer it locally so the quota meter renders without network.
  await context.route(/api\.github\.com\/rate_limit$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ resources: { core: { limit: 60, remaining: 48, reset: Math.floor(Date.now() / 1000) + 2400 } } }),
    }),
  );
  await context.routeFromHAR(har, { url: /api\.github\.com\/repos/, update: !existsSync(har), updateContent: "embed" });
  await context.addInitScript((value) => {
    if (value !== "halloween") localStorage.setItem("poltergeist.theme.v1", value);
  }, theme);
  const page = await context.newPage();
  page.on("pageerror", (error) => console.log("PAGE ERROR:", error.message));
  page.on("console", (msg) => msg.type() === "error" && console.log("CONSOLE:", msg.text()));
  return { context, page };
}
const shot = async (page, name) => {
  if (only.length && !only.some((key) => name.includes(key))) return;
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log("saved", name);
};
const nav = (page, label) => page.locator(".nav-item", { hasText: new RegExp(`^${label}`) }).first().click();

const desktop = { width: 1440, height: 900 };
{
  const { context, page } = await session(desktop);
  await page.goto(`${base}/#/`);
  await page.waitForTimeout(3200);
  await shot(page, "01-home");
  await page.getByRole("button", { name: /Open the demo dashboard/ }).click();
  await page.waitForSelector(".overview");
  await page.waitForTimeout(2500);
  await shot(page, "02-overview");
  await page.locator(".main").evaluate((el) => el.scrollTo(0, 900));
  await shot(page, "03-overview-lower");
  await page.locator(".main").evaluate((el) => el.scrollTo(0, 2000));
  await shot(page, "04-overview-bottom");
  await nav(page, "Commits");
  await page.waitForTimeout(2500);
  await shot(page, "05-commits");
  await page.locator(".main").evaluate((el) => el.scrollTo(0, 1200));
  await shot(page, "06-commits-insights");
  await nav(page, "People");
  await page.waitForTimeout(1500);
  await shot(page, "07-people");
  await nav(page, "Pull requests");
  await page.waitForTimeout(800);
  await page.locator(".issue-hit").first().click();
  await shot(page, "08-pulls");
  await nav(page, "Findings");
  await shot(page, "09-findings");
  await page.locator(".trace").first().click();
  await shot(page, "10-evidence");
  await context.close();
}
for (const theme of ["light", "midnight", "contrast"]) {
  const { context, page } = await session(desktop, theme);
  await page.goto(`${base}/#/`);
  await page.getByRole("button", { name: /Open the demo dashboard/ }).click();
  await page.waitForSelector(".overview");
  await page.waitForTimeout(2000);
  await shot(page, `11-overview-${theme}`);
  await context.close();
}
{
  const { context, page } = await session({ width: 390, height: 844 });
  await page.goto(`${base}/#/`);
  await shot(page, "12-mobile-home");
  await page.getByRole("button", { name: /Open the demo dashboard/ }).click();
  await page.waitForSelector(".overview");
  await page.waitForTimeout(1500);
  await shot(page, "13-mobile-overview");
  await context.close();
}
await browser.close();
