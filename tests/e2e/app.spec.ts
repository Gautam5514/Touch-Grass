import { expect, test } from "@playwright/test";
import { aiCalls, installMockAi, openFirstPendingAndUpload, pendingMissions, photoFile, setDelay, setMode, startAdventure } from "./helpers";

test.beforeEach(async ({ page }) => {
  await installMockAi(page);
});

test.describe("first launch", () => {
  test("shows the pitch, asks for no permissions, and leads to Explore", async ({ page, context }) => {
    const asked: string[] = [];
    page.on("dialog", (d) => asked.push(d.message()));
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Explore more. Scroll less.");
    await expect(page.getByText("Your next adventure is outside.")).toBeVisible();
    await expect(page.getByText(/photos stay on this device/i)).toBeVisible();
    expect(await context.cookies()).toHaveLength(0);
    await page.getByTestId("start-exploring").click();
    await expect(page).toHaveURL(/\/explore\/$/);
    await expect(page.getByTestId("mode-quick")).toBeVisible();
    await expect(page.getByTestId("mode-explorer")).toHaveAttribute("aria-checked", "true");
    expect(asked).toEqual([]);
  });

  test("explains the one-time download and offers the three modes", async ({ page }) => {
    await page.goto("/explore/");
    for (const [id, n] of [["quick", "3"], ["explorer", "5"], ["deep", "7"]]) await expect(page.getByTestId(`mode-${id}`)).toContainText(n);
    await expect(page.getByTestId("mode-quick")).toContainText("5 min");
  });
});

test.describe("adventure flow", () => {
  test("mode sizes: quick has 3, deep has 7 missions", async ({ page }) => {
    await startAdventure(page, "quick");
    await expect(page.locator('[data-testid^="mission-"]')).toHaveCount(3);
    await page.goto("/explore/");
    await page.getByTestId("mode-deep").click();
    await page.getByTestId("begin").click();
    await page.getByRole("button", { name: /discard and start new/i }).click();
    await page.waitForURL(/\/adventure\/\d+\/$/);
    await expect(page.locator('[data-testid^="mission-"]')).toHaveCount(7);
  });

  test("match, mismatch → manual, skip → complete with accurate summary", async ({ page }) => {
    await startAdventure(page, "quick");
    await expect(page.getByTestId("progress")).toHaveText("0/3");
    await expect(page.getByTestId("finish")).toBeDisabled();

    // 1) AI match
    await openFirstPendingAndUpload(page);
    await page.getByTestId("analyze").click();
    await expect(page.getByTestId("mission-saved")).toHaveAttribute("data-kind", "matched");
    await expect(page.getByTestId("ai-result")).toHaveAttribute("data-outcome", "matched");
    await page.getByTestId("next-mission").click();
    await expect(page.getByTestId("progress")).toHaveText("1/3");

    // 2) mismatch, stays pending, then manual log
    await setMode(page, "mismatch");
    await openFirstPendingAndUpload(page);
    await page.getByTestId("analyze").click();
    await expect(page.getByTestId("ai-result")).toHaveAttribute("data-outcome", "mismatch");
    await page.getByTestId("log-manual").click();
    await expect(page.getByTestId("mission-saved")).toHaveAttribute("data-kind", "manual");
    await page.getByTestId("next-mission").click();
    await expect(page.getByTestId("progress")).toHaveText("2/3");

    // 3) skip
    await pendingMissions(page).first().click();
    await page.getByTestId("skip").click();
    await expect(page.getByTestId("progress")).toHaveText("3/3");
    await expect(page.getByTestId("tally")).toContainText("1 verified · 1 manual · 1 skipped");
    await expect(page.getByTestId("tally")).toContainText("20 pts");

    await page.getByTestId("finish").click();
    await page.waitForURL(/\/complete\/$/);
    await expect(page.getByTestId("headline")).toHaveText("1 of 3 verified");
    const stats = page.getByTestId("stats");
    await expect(stats).toContainText("AI-verified");
    await expect(stats.locator("dd").nth(0)).toHaveText("1");
    await expect(stats.locator("dd").nth(1)).toHaveText("1");
    await expect(stats.locator("dd").nth(2)).toHaveText("1");
    await expect(stats.locator("dd").nth(3)).toHaveText("20/60");
    await expect(page.getByText(/put the phone away/i)).toBeVisible();
    await expect(page.getByRole("list", { name: "Your discoveries" }).locator("li")).toHaveCount(2);

    // revisiting a finished adventure goes straight to its summary
    await page.goto(page.url().replace("complete/", ""));
    await page.waitForURL(/\/complete\/$/);
  });

  test("an uncertain result leaves the mission pending and awards nothing", async ({ page }) => {
    await startAdventure(page, "quick");
    await setMode(page, "uncertain");
    await openFirstPendingAndUpload(page);
    await page.getByTestId("analyze").click();
    await expect(page.getByTestId("ai-result")).toHaveAttribute("data-outcome", "uncertain");
    await expect(page.getByText("Not sure yet")).toBeVisible();
    await page.getByRole("button", { name: /try another photo/i }).click();
    await page.getByRole("button", { name: /^missions$/i }).click();
    await expect(page.getByTestId("progress")).toHaveText("0/3");
    await expect(page.getByTestId("tally")).toContainText("0 pts");
    await expect(pendingMissions(page)).toHaveCount(3);
  });

  test("a model failure gives a clear message and a manual fallback, with no points", async ({ page }) => {
    await startAdventure(page, "quick");
    await setMode(page, "error");
    await openFirstPendingAndUpload(page);
    await page.getByTestId("analyze").click();
    await expect(page.getByTestId("problem")).toContainText(/error while looking at this photo/i);
    await page.getByRole("button", { name: /log it manually/i }).click();
    await expect(page.getByTestId("mission-saved")).toHaveAttribute("data-kind", "manual");
    await page.getByTestId("next-mission").click();
    await expect(page.getByTestId("tally")).toContainText("0 verified · 1 manual");
    await expect(page.getByTestId("tally")).toContainText("0 pts");
  });

  test("double-tapping Analyze runs the model once and saves one discovery", async ({ page }) => {
    await startAdventure(page, "quick");
    await setDelay(page, 400);
    await openFirstPendingAndUpload(page);
    const btn = page.getByTestId("analyze");
    await btn.dblclick();
    await expect(page.getByTestId("mission-saved")).toBeVisible();
    expect(await aiCalls(page)).toBe(1);
    await page.getByTestId("next-mission").click();
    await expect(page.getByTestId("tally")).toContainText("20 pts");
    await page.goto("/journal/");
    await expect(page.getByTestId("journal-card")).toHaveCount(1);
  });

  test("rejects a non-image and shows how to recover", async ({ page }) => {
    await startAdventure(page, "quick");
    await pendingMissions(page).first().click();
    await page.getByTestId("file-input").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await expect(page.getByTestId("problem")).toContainText(/isn’t an image/i);
    await page.getByTestId("file-input").setInputFiles({ name: "broken.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not really a jpeg") });
    await expect(page.getByTestId("problem")).toContainText(/couldn’t read that image/i);
    await page.getByTestId("file-input").setInputFiles(await photoFile());
    await expect(page.getByTestId("analyze")).toBeVisible();
  });

  test("progress survives a refresh and the home page offers to continue", async ({ page }) => {
    const id = await startAdventure(page, "quick");
    await openFirstPendingAndUpload(page);
    await page.getByTestId("analyze").click();
    await page.getByTestId("next-mission").click();
    await expect(page.getByTestId("progress")).toHaveText("1/3");
    await page.reload();
    await expect(page.getByTestId("progress")).toHaveText("1/3");
    await expect(page).toHaveURL(new RegExp(`/adventure/${id}/$`));
    await page.goto("/");
    await expect(page.getByText("1 of 3 missions done")).toBeVisible();
    await page.getByRole("link", { name: "Continue adventure" }).click();
    await expect(page.getByTestId("progress")).toHaveText("1/3");
  });

  test("unknown adventure id shows a friendly not-found state", async ({ page }) => {
    await page.goto("/adventure/99999/");
    await expect(page.getByRole("heading", { name: "Adventure not found" })).toBeVisible();
    await page.goto("/definitely-not-a-page/");
    await expect(page.getByRole("heading", { name: "Off the trail" })).toBeVisible();
  });
});

test.describe("journal and data", () => {
  async function oneDiscovery(page: import("@playwright/test").Page) {
    await startAdventure(page, "quick");
    await openFirstPendingAndUpload(page);
    await page.getByTestId("analyze").click();
    await page.getByTestId("next-mission").click();
  }

  test("journal lists discoveries, shows details with the model id, and deletes one", async ({ page }) => {
    await page.goto("/journal/");
    await expect(page.getByText("Nothing here yet")).toBeVisible();
    await oneDiscovery(page);
    await page.goto("/journal/");
    const card = page.getByTestId("journal-card");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("AI-matched");
    await card.getByRole("button").click();
    const dlg = page.getByRole("dialog");
    await expect(dlg).toContainText("Xenova/clip-vit-base-patch32");
    await expect(dlg).toContainText("relative, not a probability");
    await dlg.getByTestId("delete-discovery").click();
    await page.getByRole("button", { name: "Delete photo" }).click();
    await expect(page.getByTestId("journal-card")).toHaveCount(0);
  });

  test("Settings: honest offline state, model info, and delete-all", async ({ page }) => {
    await oneDiscovery(page);
    await page.goto("/settings/");
    await expect(page.getByText("Xenova/clip-vit-base-patch32").first()).toBeVisible();
    const status = page.getByTestId("offline-status");
    await expect(status).not.toHaveAttribute("data-status", "CHECKING");
    // Not a production service-worker run, so it must never claim to be offline ready.
    await expect(status).not.toHaveAttribute("data-status", "OFFLINE_READY");
    await expect(page.getByRole("switch", { name: /approximate location/i })).toHaveAttribute("aria-checked", "false");

    await page.getByTestId("clear-data").click();
    await page.getByRole("button", { name: "Delete all data" }).click();
    await expect(page.getByTestId("settings-msg")).toContainText("deleted");
    await page.goto("/journal/");
    await expect(page.getByText("Nothing here yet")).toBeVisible();
    await page.goto("/");
    await expect(page.getByText(/missions done/)).toHaveCount(0);
  });

  test("About and Privacy pages cover the required explanations", async ({ page }) => {
    await page.goto("/privacy/");
    for (const t of [/analyzed on your device/i, /browser storage/i, /delete your data/i, /public host/i, /optional and off/i, /clearing browser data/i]) await expect(page.getByText(t).first()).toBeVisible();
    await page.goto("/about/");
    await expect(page.getByText(/relative similarity/i).first()).toBeVisible();
    await expect(page.getByText(/open-weight/i).first()).toBeVisible();
  });
});

test.describe("location is opt-in", () => {
  test("never asks for location during play when the toggle is off", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await page.addInitScript(() => {
      (window as unknown as Record<string, number>).__GEO_CALLS__ = 0;
      const real = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
      navigator.geolocation.getCurrentPosition = (...a) => {
        (window as unknown as Record<string, number>).__GEO_CALLS__++;
        return real(...a);
      };
    });
    await startAdventure(page, "quick");
    await openFirstPendingAndUpload(page);
    await page.getByTestId("analyze").click();
    await page.getByTestId("next-mission").click();
    expect(await page.evaluate(() => (window as unknown as Record<string, number>).__GEO_CALLS__)).toBe(0);
  });
});

test.describe("accessibility basics", () => {
  test("every control has a name, touch targets are large and the nav exposes the current page", async ({ page }) => {
    for (const path of ["/", "/explore/", "/journal/", "/settings/", "/about/"]) {
      await page.goto(path);
      const unnamed = await page.$$eval("button, a[href], input, [role=switch], [role=radio]", (els) =>
        els.filter((e) => !(e.textContent || "").trim() && !e.getAttribute("aria-label") && !e.getAttribute("aria-labelledby")).map((e) => e.outerHTML.slice(0, 80)),
      );
      expect(unnamed, path).toEqual([]);
      const small = await page.$$eval("nav a, main button, main a", (els) =>
        els.filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && cs.display !== "inline" && (r.height < 43.5 || r.width < 43.5); }).map((e) => `${e.textContent?.trim().slice(0, 30)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`),
      );
      expect(small, path).toEqual([]);
    }
    await page.goto("/journal/");
    await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Journal" })).toHaveAttribute("aria-current", "page");
  });

  test("no horizontal scroll at phone width", async ({ page }) => {
    for (const path of ["/", "/explore/", "/journal/", "/settings/"]) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
    }
  });
});

test.describe("storage unavailable", () => {
  test("shows a clear blocking message and a retry when IndexedDB can't open", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true });
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /can’t save on this device/i })).toBeVisible();
    await expect(page.getByText(/private browsing|blocked storage/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });
});
