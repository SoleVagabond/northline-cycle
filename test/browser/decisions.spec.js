import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const stage = (page) => page.locator(".repair-detail .stage-badge");
async function ready(page) {
  await page.goto("/");
  await expect(page.locator(".repair-choice")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Workshop view", exact: true })
    .click();
}
async function revise(page, parts = "pads", labour = "adjustment") {
  await page
    .locator(".decision-editor:not(.cancellation-editor) summary")
    .click();
  await page
    .getByLabel("Replacement parts", { exact: true })
    .selectOption(parts);
  await page
    .getByLabel("Service charge ($)", { exact: true })
    .fill(labour === "standard" ? "65" : "85");
  await page
    .getByLabel("Part specification (if replacing a part)", { exact: true })
    .fill("Fictional inspected compatible part");
  await page
    .getByRole("button", {
      name: "Send revised estimate for approval",
      exact: true,
    })
    .click();
  await expect(page.locator(".quote-version")).toContainText("Estimate v2");
}
async function customer(page) {
  await page
    .getByRole("button", { name: "Customer view", exact: true })
    .click();
}
async function workshop(page) {
  await page
    .getByRole("button", { name: "Workshop view", exact: true })
    .click();
}
test("revised estimate, exact approval, parts wait and collection persist with both quote versions", async ({
  page,
}, info) => {
  await ready(page);
  await revise(page);
  await expect(page.locator(".repair-quote > strong")).toHaveText("$125");
  await expect(page.locator(".repair-quote")).toContainText(
    "Replacement brake pads",
  );
  await expect(page.locator("[data-action=advance]")).toHaveCount(0);
  await customer(page);
  await page
    .getByRole("button", { name: "Approve $125 estimate", exact: false })
    .click();
  await workshop(page);
  await page
    .getByRole("button", { name: "Pause: waiting for parts", exact: true })
    .click();
  await expect(stage(page)).toHaveText("Waiting for parts");
  await expect(page.locator("[data-action=advance]")).toHaveCount(0);
  await page.reload();
  await workshop(page);
  await expect(stage(page)).toHaveText("Waiting for parts");
  await page
    .getByRole("button", { name: "Parts arrived — resume repair", exact: true })
    .click();
  await expect(stage(page)).toHaveText("On the workbench");
  for (const action of [
    "Move to ride check",
    "Mark ready to collect",
    "Mark collected",
  ])
    await page.getByRole("button", { name: action, exact: false }).click();
  await expect(stage(page)).toHaveText("Back on the road");
  await page.reload();
  await expect(stage(page)).toHaveText("Back on the road");
  await page.locator(".quote-history summary").click();
  await expect(page.locator(".quote-history")).toContainText("v1 · $80");
  await expect(page.locator(".quote-history")).toContainText(
    "v2 · $125 · current",
  );
  await expect(page.locator(".quote-history")).toContainText(
    "Approved by customer",
  );
  await page
    .locator("#tracker")
    .screenshot({ path: info.outputPath("revised-estimate-collected.png") });
});
test("declining an estimate pauses work and an alternative needs a fresh customer decision", async ({
  page,
}) => {
  await ready(page);
  await revise(page);
  await customer(page);
  await page
    .getByRole("button", { name: "Decline this estimate", exact: true })
    .click();
  await expect(stage(page)).toHaveText("Estimate declined");
  await expect(page.locator("[data-action=approve]")).toHaveCount(0);
  await workshop(page);
  await page
    .locator(".decision-editor:not(.cancellation-editor) summary")
    .click();
  await page
    .getByLabel("Replacement parts", { exact: true })
    .selectOption("tube");
  await page.getByLabel("Service charge ($)", { exact: true }).fill("65");
  await page
    .getByLabel("Part specification (if replacing a part)", { exact: true })
    .fill("700c tube, Presta 48 mm");
  await page
    .getByRole("button", {
      name: "Send revised estimate for approval",
      exact: true,
    })
    .click();
  await expect(page.locator(".quote-version")).toContainText("Estimate v3");
  await customer(page);
  await page
    .getByRole("button", { name: "Approve $92 estimate", exact: false })
    .click();
  await page.locator(".quote-history summary").click();
  await expect(page.locator(".quote-history")).toContainText(
    "Declined by customer",
  );
  await expect(page.locator(".quote-history")).toContainText(
    "Approved by customer",
  );
});
test("cancellation requires confirmation and leaves a closed repair with persistent history", async ({
  page,
}) => {
  await ready(page);
  await customer(page);
  await page.locator(".cancellation-editor summary").click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(stage(page)).toHaveText("Your approval");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(stage(page)).toHaveText("Repair cancelled");
  await expect(page.locator("[data-action]")).toHaveCount(0);
  await expect(page.locator(".repair-history li")).toHaveCount(4);
  await page.reload();
  await expect(stage(page)).toHaveText("Repair cancelled");
  await expect(page.locator(".repair-history")).toContainText(
    "Customer cancelled",
  );
  await page
    .getByLabel("Show repairs", { exact: true })
    .selectOption("cancelled");
  await expect(page.locator(".repair-choice")).toHaveCount(1);
});
test("a lost revision response blocks decisions until the saved new quote reloads", async ({
  page,
}) => {
  await ready(page);
  await page.route("**/api/tracker/actions", async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort("failed");
  });
  await page
    .locator(".decision-editor:not(.cancellation-editor) summary")
    .click();
  await page
    .getByLabel("Replacement parts", { exact: true })
    .selectOption("pads");
  await page.getByLabel("Service charge ($)", { exact: true }).fill("85");
  await page
    .getByLabel("Part specification (if replacing a part)", { exact: true })
    .fill("Compatible sample brake pads");
  await page
    .getByRole("button", {
      name: "Send revised estimate for approval",
      exact: true,
    })
    .click();
  await expect(page.locator(".saved-badge")).toHaveText(
    "Saved progress needs review",
  );
  await expect(
    page.getByLabel("Replacement parts", { exact: true }),
  ).toHaveValue("pads");
  await expect(page.locator(".quote-preview")).toContainText(
    "Revised total: $125",
  );
  await expect(
    page.getByRole("button", {
      name: "Send revised estimate for approval",
      exact: true,
    }),
  ).toBeDisabled();
  await page.unroute("**/api/tracker/actions");
  await page
    .getByRole("button", { name: "Reload saved progress", exact: true })
    .click();
  await expect(page.locator(".quote-version")).toContainText("Estimate v2");
  await expect(page.locator(".repair-quote > strong")).toHaveText("$125");
  await customer(page);
  await expect(
    page.getByRole("button", { name: "Approve $125 estimate", exact: false }),
  ).toBeEnabled();
});
test("expanded estimate editors and exception states fit the screen and pass accessibility checks", async ({
  page,
}, info) => {
  await ready(page);
  for (const state of ["editor", "declined", "cancelled"]) {
    if (state === "editor")
      await page
        .locator(".decision-editor:not(.cancellation-editor) summary")
        .click();
    if (state === "declined") {
      await customer(page);
      await page
        .getByRole("button", { name: "Decline this estimate", exact: true })
        .click();
      await expect(stage(page)).toHaveText("Estimate declined");
    }
    if (state === "cancelled") {
      await page.locator(".cancellation-editor summary").click();
      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByRole("button", { name: "Confirm cancellation", exact: true })
        .click();
      await expect(stage(page)).toHaveText("Repair cancelled");
    }
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    await info.attach(`accessibility-${state}`, {
      body: JSON.stringify(scan, null, 2),
      contentType: "application/json",
    });
    expect(scan.violations).toEqual([]);
  }
});
