import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Real-model integration test against the PRODUCTION build: actual CLIP weights from Hugging Face run in
 * a Web Worker, nothing is mocked. It also checks that photos never leave the device and that offline
 * inference works with the network switched off. Needs internet for the one-time model download.
 */
const photo = (name: string) => path.join(process.cwd(), "eval", "heldout", name);

async function openMission(page: Page, id: string) {
  await page.getByTestId(`mission-${id}`).click();
}
async function analyze(page: Page, file: string) {
  await page.getByTestId("file-input").setInputFiles(photo(file));
  await page.getByTestId("analyze").click();
  await page.getByTestId("ai-result").waitFor({ timeout: 120_000 });
  return page.getByTestId("ai-result").getAttribute("data-outcome");
}

test("real CLIP inference, privacy, persistence and offline", async ({ page, context }) => {
  // A fake AI that would fail every test if the production bundle honored it.
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__WQ_MOCK_AI__ = { classify: () => { throw new Error("production must ignore the mock hook"); } };
  });

  const requests: { method: string; host: string; hasBody: boolean }[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.protocol === "http:" || u.protocol === "https:") requests.push({ method: r.method(), host: u.host, hasBody: !!r.postData() }); // blob:/data: never hit the network
  });
  const worker = new Promise<void>((resolve) => page.on("worker", () => resolve()));

  // ---- start a Deep Discovery adventure (all 7 missions) and download the real model ----
  await page.goto("/");
  await page.getByTestId("start-exploring").click();
  await page.getByTestId("mode-deep").click();
  await page.getByTestId("begin").click();
  await page.waitForURL(/\/adventure\/\d+\/$/, { timeout: 300_000 });
  const adventureUrl = page.url();
  await worker; // inference happens in a Web Worker, off the main thread

  // ---- a genuine photo is matched by the real model ----
  await openMission(page, "green-leaf");
  expect(await analyze(page, "green-leaf-1.jpg")).toBe("matched");
  await page.getByTestId("next-mission").click();

  await openMission(page, "sky");
  expect(await analyze(page, "sky-1.jpg")).toBe("matched");
  await page.getByTestId("next-mission").click();
  await expect(page.getByTestId("tally")).toContainText("2 verified");
  await expect(page.getByTestId("tally")).toContainText("40 pts");

  // ---- an unrelated photo is not accepted ----
  await openMission(page, "flower");
  const wrong = await analyze(page, "indoor-1.jpg");
  expect(["mismatch", "uncertain"]).toContain(wrong);
  await page.getByRole("button", { name: /^missions$/i }).click();
  await expect(page.getByTestId("tally")).toContainText("2 verified");

  // ---- privacy: no uploads. Only GETs, only to this origin and the model host. ----
  expect(requests.filter((r) => r.method !== "GET" && r.method !== "HEAD")).toEqual([]);
  expect(requests.filter((r) => r.hasBody)).toEqual([]);
  const hosts = new Set(requests.map((r) => r.host));
  for (const h of hosts) expect(h, `unexpected host ${h}`).toMatch(/^(localhost:\d+|([\w-]+\.)*(huggingface\.co|hf\.co))$/);
  expect([...hosts].some((h) => /hf|huggingface/.test(h))).toBe(true); // the real weights were fetched

  // ---- persistence across refresh ----
  await page.reload();
  await expect(page.getByTestId("tally")).toContainText("2 verified");

  // ---- offline: download for offline use, which runs the network-blocked self-test ----
  await page.goto("/settings/");
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30_000 });
  const status = page.getByTestId("offline-status");
  await expect(status).not.toHaveAttribute("data-status", "CHECKING");
  await expect(status).not.toHaveAttribute("data-status", "OFFLINE_READY"); // never claimed before the test
  await page.getByRole("button", { name: /download for offline use|run offline check/i }).click();
  await expect(status).toHaveAttribute("data-status", "OFFLINE_READY", { timeout: 240_000 });

  // ---- really offline: reload, reopen the adventure, and run inference with no network ----
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("offline-status")).toHaveAttribute("data-status", "OFFLINE_READY", { timeout: 30_000 });
  await page.goto(adventureUrl);
  await expect(page.getByTestId("tally")).toContainText("2 verified");
  await openMission(page, "grass");
  expect(await analyze(page, "grass-2.jpg")).toBe("matched");
  await page.getByTestId("next-mission").click();
  await expect(page.getByTestId("tally")).toContainText("3 verified");
  await context.setOffline(false);
});

// --- Failure paths that need the production AI code (the mock build bypasses it) ---

test("unsupported browser: clear message, then a working manual-only adventure", async ({ page }) => {
  await page.addInitScript(() => {
    // @ts-expect-error simulate a browser without Web Workers
    delete window.Worker;
  });
  await page.goto("/explore/");
  await page.getByTestId("mode-quick").click();
  await page.getByTestId("begin").click();
  // Starting an adventure never waits on the AI — it's reached immediately regardless of AI status.
  await page.waitForURL(/\/adventure\/\d+\/$/);

  await page.locator('[data-testid^="mission-"][data-status="pending"]').first().click();
  await page.getByTestId("file-input").setInputFiles(photo("green-leaf-1.jpg"));
  await page.getByTestId("analyze").click();
  await expect(page.getByTestId("problem")).toContainText("can’t run the on-device AI");
  await page.getByRole("button", { name: /log it manually/i }).click();
  await expect(page.getByTestId("mission-saved")).toHaveAttribute("data-kind", "manual");
  await page.getByTestId("next-mission").click();
  await expect(page.getByTestId("tally")).toContainText("0 verified · 1 manual");
  await expect(page.getByTestId("tally")).toContainText("0 pts");
});

test("offline with no downloaded model: explains why at analysis time and offers manual logging", async ({ page, context }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30_000 });
  await page.goto("/explore/"); // lets the service worker cache the page we are about to use offline
  await context.setOffline(true);
  await page.reload();
  await page.getByTestId("mode-quick").click();
  await page.getByTestId("begin").click();
  // Starting an adventure never waits on the AI — it's reached immediately regardless of AI status.
  await page.waitForURL(/\/adventure\/\d+\/$/);

  await page.locator('[data-testid^="mission-"][data-status="pending"]').first().click();
  await page.getByTestId("file-input").setInputFiles(photo("green-leaf-1.jpg"));
  await page.getByTestId("analyze").click();
  await expect(page.getByTestId("problem")).toContainText("offline and the AI model isn’t saved");
  await page.getByRole("button", { name: /log it manually/i }).click();
  await expect(page.getByTestId("mission-saved")).toHaveAttribute("data-kind", "manual");
  await context.setOffline(false);
});
