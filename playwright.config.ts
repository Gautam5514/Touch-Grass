import { defineConfig, devices } from "@playwright/test";

// Two builds are tested:
//  - "mock": built with NEXT_PUBLIC_E2E=1 so flow tests can inject deterministic AI scores.
//  - "real": the production build, running the actual CLIP model in the browser.
// Build both first with `npm run build:all`, then `npm run test:e2e`.
const phone = { ...devices["Pixel 7"], serviceWorkers: "allow" as const };

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  use: { trace: "retain-on-failure" },
  projects: [
    { name: "mock", testMatch: /app\.spec\.ts/, use: { ...phone, baseURL: "http://localhost:4301" } },
    { name: "real", testMatch: /real\.spec\.ts/, timeout: 600_000, use: { ...phone, baseURL: "http://localhost:4302" } },
  ],
  webServer: [
    { command: "node scripts/serve.mjs out-e2e 4301", url: "http://localhost:4301", reuseExistingServer: true },
    { command: "node scripts/serve.mjs out 4302", url: "http://localhost:4302", reuseExistingServer: true },
  ],
});
