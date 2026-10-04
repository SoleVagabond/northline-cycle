const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./test/browser",
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 45000,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "work/browser-report" }],
  ],
  outputDir: "work/browser-results",
  use: {
    baseURL: "http://127.0.0.1:8796",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { browserName: "chromium", viewport: { width: 1280, height: 900 } },
    },
    {
      name: "mobile-375",
      use: {
        browserName: "chromium",
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "mobile-320",
      use: {
        browserName: "chromium",
        viewport: { width: 320, height: 740 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "node test/browser/server.mjs",
    url: "http://127.0.0.1:8796/api/services",
    reuseExistingServer: false,
    timeout: 20000,
  },
});
