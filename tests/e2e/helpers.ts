import type { Page } from "@playwright/test";
import sharp from "sharp";

export type MockMode = "match" | "mismatch" | "uncertain" | "error";

/** Installs a deterministic stand-in for the AI worker. Only honored by the NEXT_PUBLIC_E2E build. */
export async function installMockAi(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__WQ_MODE__ = "match";
    w.__WQ_DELAY__ = 30;
    w.__WQ_CALLS__ = 0;
    w.__WQ_MOCK_AI__ = {
      prepare: () => new Promise((r) => setTimeout(r, 30)),
      classify: async (labels: string[]) => {
        w.__WQ_CALLS__ = (w.__WQ_CALLS__ as number) + 1;
        await new Promise((r) => setTimeout(r, w.__WQ_DELAY__ as number));
        const mode = w.__WQ_MODE__ as string;
        if (mode === "error") throw new Error("simulated model failure");
        // labels[0] is always the mission target; the last one is a shared negative ("car on a road").
        const score = (target: number, other?: [number, number]) => {
          const rest = labels.length - 1;
          return labels.map((label, i) => ({
            label,
            score: i === 0 ? target : other && i === other[0] ? other[1] : (1 - target - (other ? other[1] : 0)) / (rest - (other ? 1 : 0)),
          }));
        };
        if (mode === "match") return { scores: score(0.92), ms: 120 };
        if (mode === "mismatch") return { scores: score(0.03, [labels.length - 1, 0.85]), ms: 120 };
        // uncertain: weak target, with a rival (never the target's own alias) close behind
        return { scores: score(0.3, [labels.length - 1, 0.28]), ms: 120 };
      },
    };
  });
}

export const setMode = (page: Page, mode: MockMode) => page.evaluate((m) => ((window as unknown as Record<string, unknown>).__WQ_MODE__ = m), mode);
export const setDelay = (page: Page, ms: number) => page.evaluate((m) => ((window as unknown as Record<string, unknown>).__WQ_DELAY__ = m), ms);
export const aiCalls = (page: Page) => page.evaluate(() => (window as unknown as Record<string, number>).__WQ_CALLS__);

export const greenJpeg = () =>
  sharp({ create: { width: 640, height: 480, channels: 3, background: "#3a7d44" } }).jpeg().toBuffer();

export const photoFile = async (name = "photo.jpg") => ({ name, mimeType: "image/jpeg", buffer: await greenJpeg() });

/** Home → Explore → chosen mode → begin → session page. Returns the adventure id. */
export async function startAdventure(page: Page, mode: "quick" | "explorer" | "deep" = "quick") {
  await page.goto("/");
  await page.getByTestId("start-exploring").click();
  await page.waitForURL("**/explore/");
  await page.getByTestId(`mode-${mode}`).click();
  await page.getByTestId("begin").click();
  await page.waitForURL(/\/adventure\/\d+\/$/);
  return Number(page.url().match(/adventure\/(\d+)/)![1]);
}

export const pendingMissions = (page: Page) => page.locator('[data-testid^="mission-"][data-status="pending"]');

/** Opens the first pending mission and uploads a photo through the file-picker fallback. */
export async function openFirstPendingAndUpload(page: Page) {
  await pendingMissions(page).first().click();
  await page.getByTestId("file-input").setInputFiles(await photoFile());
  await page.getByTestId("analyze").waitFor();
}
