// Captures README screenshots from the mock-AI build (npm run build:e2e) using real photos from eval/heldout.
// Usage: node scripts/screenshots.mjs   (serves out-e2e on :4310 itself)
import { chromium, devices } from "@playwright/test";
import { spawn } from "node:child_process";
import path from "node:path";

const PORT = 4310;
const U = `http://localhost:${PORT}`;
const server = spawn("node", ["scripts/serve.mjs", "out-e2e", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));
const PHOTO = { "green-leaf": "green-leaf-1", flower: "flower-1", "tree-trunk": "tree-trunk-1", sky: "sky-1", grass: "grass-2", rock: "rock-2", "fallen-leaf": "fallen-leaf-1" };

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["Pixel 7"], deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.addInitScript(() => {
  window.__WQ_MOCK_AI__ = {
    prepare: () => new Promise((r) => setTimeout(r, 30)),
    classify: async (labels) => ({ scores: labels.map((label, i) => ({ label, score: i === 0 ? 0.88 : 0.12 / (labels.length - 1) })), ms: 420 }),
  };
});
const shot = async (name) => { await page.waitForTimeout(700); await page.screenshot({ path: `docs/screenshots/${name}.jpg`, type: "jpeg", quality: 82 }); };

await page.goto(U + "/");
await shot("01-home");
await page.getByTestId("start-exploring").click();
await shot("02-explore");
await page.getByTestId("mode-explorer").click();
await page.getByTestId("begin").click();
await page.waitForURL(/\/adventure\/\d+\/$/);
await shot("03-missions");

async function doMission(index, snap) {
  const el = page.locator('[data-testid^="mission-"][data-status="pending"]').first();
  const id = (await el.getAttribute("data-testid")).replace("mission-", "");
  await el.click();
  if (snap === "capture") await shot("04-capture");
  await page.getByTestId("file-input").setInputFiles(path.join("eval/heldout", `${PHOTO[id]}.jpg`));
  await page.getByTestId("analyze").waitFor();
  await page.getByTestId("analyze").click();
  await page.getByTestId("ai-result").waitFor();
  if (snap) { await page.evaluate(() => window.scrollTo(0, 0)); await shot(snap === "capture" ? "05-result" : snap); }
  await page.getByTestId("next-mission").click();
}
await doMission(0, "capture");
for (let i = 1; i < 5; i++) await doMission(i);
await shot("06-missions-done");
await page.getByTestId("finish").click();
await page.waitForURL(/complete\/$/);
await shot("07-complete");
await page.goto(U + "/journal/");
await shot("08-journal");
await page.goto(U + "/settings/");
await shot("09-settings");

const desktop = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const dp = await desktop.newPage();
await dp.addInitScript(() => { window.__WQ_MOCK_AI__ = { classify: async () => ({ scores: [] }) }; });
await dp.goto(U + "/");
await dp.waitForTimeout(800);
await dp.screenshot({ path: "docs/screenshots/10-desktop-home.jpg", type: "jpeg", quality: 82 });
await dp.goto(U + "/explore/");
await dp.waitForTimeout(600);
await dp.screenshot({ path: "docs/screenshots/11-desktop-explore.jpg", type: "jpeg", quality: 82 });
await browser.close();
server.kill();
console.log("done");
