import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createApp } from "../../server.js";
const heading = (page) => page.getByRole("heading", { level: 1 });
const nav = (page, name) =>
  page
    .getByRole("navigation", { name: "Workshop navigation" })
    .getByRole("link", { name, exact: true });
async function ready(page) {
  await page.goto("/workshop.html");
  await expect(heading(page)).toHaveText("A clear bench. A better day.");
  await expect(page.locator("#save-state")).toHaveText("All changes saved");
}
async function openJob(page, id = "NL-2401") {
  await nav(page, "Repair queue").click();
  await page.locator(`a[href="#repair/${id}"]`).click();
  await expect(page.locator(".page-heading .eyebrow")).toContainText(id);
}
async function createRepair(page, service = "brake") {
  await page.getByRole("button", { name: "+ New repair", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "A new repair, a clear plan.",
  });
  await dialog.getByLabel("Repair type", { exact: true }).selectOption(service);
  await dialog
    .getByRole("button", { name: "Create repair", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#save-state")).toHaveText("All changes saved");
  await expect(page.locator(".page-heading .eyebrow")).toContainText(
    "WORKSHOP VIEW",
  );
}
test("new workshop repair completes scheduling, multi-part approval, stock use, quality checks and payment", async ({
  page,
}) => {
  await ready(page);
  await createRepair(page);
  await expect(heading(page)).toHaveText("City commuter");
  await page
    .getByLabel("Due date", { exact: true })
    .fill(new Date().toISOString().slice(0, 10));
  await page.getByLabel("Mechanic", { exact: true }).selectOption("lee");
  await page
    .getByRole("button", { name: "Save schedule", exact: true })
    .click();
  await expect(page.locator("#app-message")).toHaveText(
    "Schedule and mechanic assignment saved.",
  );
  await page
    .getByRole("button", { name: "Start inspection", exact: true })
    .click();
  await page
    .locator("#note-form textarea")
    .fill("Brake pad wear recorded; inspect tyre pressure.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.locator(".journal")).toContainText(
    "Brake pad wear recorded",
  );
  await page.getByText("Revise the estimate", { exact: true }).click();
  await page
    .getByLabel("Labour scope", { exact: true })
    .selectOption("adjustment");
  await page.getByRole("checkbox", { name: /Replacement brake pads/ }).check();
  await page.getByRole("checkbox", { name: /Replacement inner tube/ }).check();
  await page
    .getByLabel("Quantity for Replacement inner tube", { exact: true })
    .fill("2");
  await page
    .getByLabel("Quantity for Replacement inner tube", { exact: true })
    .dispatchEvent("change");
  await expect(page.locator("#estimate-preview")).toContainText("$109");
  await page
    .getByRole("button", {
      name: "Request approval for revised estimate",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Customer view", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Approve $109 estimate", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Workshop view", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Pause for parts", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Parts arrived — resume repair", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move to ride check", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Mark ready to collect", exact: true }),
  ).toBeDisabled();
  for (const name of [
    "Brakes stop safely",
    "Gears shift cleanly",
    "Wheels and tyres checked",
    "Fasteners secure; ride check complete",
  ])
    await page.getByRole("button", { name, exact: true }).click();
  await page
    .getByRole("button", { name: "Mark ready to collect", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Record $109 payment", exact: true })
    .click();
  await expect(page.locator("#app-message")).toContainText(
    "No external charge",
  );
  await page
    .getByRole("button", { name: "Mark collected", exact: true })
    .click();
  await page.reload();
  await expect(page.locator(".journal")).toContainText(
    "Payment recorded: $109",
  );
  await expect(page.locator(".quote-total")).toHaveText("$109");
  await nav(page, "Parts & stock").click();
  await expect(
    page
      .locator(".stock-card")
      .filter({
        has: page.getByRole("heading", {
          name: "Replacement brake pads",
          exact: true,
        }),
      })
      .locator(".stock-counts"),
  ).toContainText("3");
  await expect(
    page.getByRole("heading", { name: "Stock movements", exact: true }),
  ).toBeVisible();
  await nav(page, "Reports").click();
  await expect(
    page.locator(".stat").filter({ hasText: "Payments recorded" }),
  ).toContainText("$109");
});
test("service catalogue price changes preserve existing estimates and price new intake", async ({
  page,
}) => {
  await ready(page);
  await nav(page, "Services & prices").click();
  await expect(page.locator(".service-card-app")).toHaveCount(12);
  const card = page.locator(".service-card-app").filter({
    has: page.getByRole("heading", { name: "Everyday tune-up", exact: true }),
  });
  await card.getByText("Edit service price", { exact: true }).click();
  await card
    .getByLabel("Labour price for Everyday tune-up", { exact: true })
    .fill("90");
  await card.getByRole("button", { name: "Save service", exact: true }).click();
  await expect(page.locator("#app-message")).toContainText(
    "Existing estimates retain",
  );
  await openJob(page);
  await expect(page.locator(".quote-total")).toHaveText("$80");
  await createRepair(page, "tune");
  await expect(page.locator(".quote-total")).toHaveText("$90");
  await page.reload();
  await expect(page.locator(".quote-total")).toHaveText("$90");
  await page.goto("/#request");
  await page.getByLabel("Service", { exact: true }).selectOption("tune");
  await expect(page.locator("#estimate-value")).toHaveText("$90");
});
test("stock receipt resolves an approved repair's shortage and saves the ledger", async ({
  page,
}) => {
  await ready(page);
  await openJob(page);
  await page.getByText("Revise the estimate", { exact: true }).click();
  await page.getByRole("checkbox", { name: /Replacement brake pads/ }).check();
  await page
    .getByLabel("Quantity for Replacement brake pads", { exact: true })
    .fill("5");
  await page
    .getByRole("button", {
      name: "Request approval for revised estimate",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Customer view", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Approve $205 estimate", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Workshop view", exact: true })
    .click();
  await expect(page.locator(".next-action h3")).toHaveText("Waiting for parts");
  await page
    .getByRole("button", { name: "Parts arrived — resume repair", exact: true })
    .click();
  await expect(page.locator("#app-message")).toContainText(
    "Receive enough stock",
  );
  await nav(page, "Parts & stock").click();
  await page
    .getByLabel("Units received for Replacement brake pads", { exact: true })
    .fill("1");
  await page
    .locator('[data-stock="pads"]')
    .getByRole("button", { name: "Receive stock", exact: true })
    .click();
  await expect(page.locator("#app-message")).toHaveText("Stock receipt saved.");
  await openJob(page);
  await page
    .getByRole("button", { name: "Parts arrived — resume repair", exact: true })
    .click();
  await expect(page.locator(".next-action h3")).toHaveText("On the workbench");
  await page.reload();
  await expect(page.locator(".next-action h3")).toHaveText("On the workbench");
});
test("queue search, status filters, schedule and priorities operate on the same saved jobs", async ({
  page,
}) => {
  await ready(page);
  await nav(page, "Repair queue").click();
  await page.getByLabel("Search repairs", { exact: true }).fill("wheel true");
  await expect(page.locator(".repair-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".repair-table")).toContainText("$35");
  await page.getByLabel("Status", { exact: true }).selectOption("collected");
  await expect(
    page.getByRole("heading", { name: "No repairs match", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(page.locator(".repair-table tbody tr")).toHaveCount(3);
  await page.locator('a[href="#repair/NL-2403"]').click();
  await page
    .getByLabel("Due date", { exact: true })
    .fill(new Date().toISOString().slice(0, 10));
  await page.getByLabel("Mechanic", { exact: true }).selectOption("lee");
  await page.getByLabel("Priority", { exact: true }).selectOption("high");
  await page
    .getByRole("button", { name: "Save schedule", exact: true })
    .click();
  await expect(page.locator("#app-message")).toContainText(
    "Schedule and mechanic",
  );
  await nav(page, "Schedule").click();
  await expect(page.locator(".calendar-job")).toHaveCount(3);
  for (const bike of ["City commuter", "Weekend road bike", "Everyday hybrid"])
    await expect(
      page.locator(".calendar-job").filter({ hasText: bike }),
    ).toHaveCount(1);
});
test("exports contain real saved records, print output is readable, and notes render as text", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await ready(page);
  await openJob(page);
  const note = '<img src=x onerror="window.northlineInjected=true">';
  await page.locator("#note-form textarea").fill(note);
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.locator(".journal")).toContainText(note);
  await expect(page.locator(".journal img")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Print repair summary", exact: true })
    .click();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-document")).toBeVisible();
  await expect(page.locator(".print-document")).toContainText("$80");
  await expect(page.locator(".print-document img")).toHaveCount(0);
  await page.emulateMedia({ media: "screen" });
  await nav(page, "Reports").click();
  const csvDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export repairs", exact: false })
    .click();
  const csv = await readFile(await (await csvDownload).path(), "utf8");
  expect(csv).toContain('"Everyday tune-up"');
  expect(csv).toContain('"80"');
  const jsonDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export workspace", exact: false })
    .click();
  const backup = JSON.parse(
    await readFile(await (await jsonDownload).path(), "utf8"),
  );
  expect(backup.workspace.jobs).toHaveLength(3);
  expect(backup.workspace.id).toBeUndefined();
});
test("a stock receipt with a lost response locks writes until refreshed without repeating the receipt", async ({
  page,
}) => {
  await ready(page);
  await nav(page, "Parts & stock").click();
  await page.route("**/api/workshop/actions", async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort("failed");
  });
  await page
    .getByLabel("Units received for Replacement brake pads", { exact: true })
    .fill("3");
  await page
    .locator('[data-stock="pads"]')
    .getByRole("button", { name: "Receive stock", exact: true })
    .click();
  await expect(page.locator("#save-state")).toHaveText("Reload to confirm");
  await expect(page.locator('[data-stock="pads"] button')).toBeDisabled();
  await page.unroute("**/api/workshop/actions");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator("#save-state")).toHaveText("All changes saved");
  await expect(
    page
      .locator(".stock-card")
      .filter({
        has: page.getByRole("heading", {
          name: "Replacement brake pads",
          exact: true,
        }),
      })
      .locator(".stock-counts strong")
      .first(),
  ).toHaveText("7");
  await expect(page.locator(".repair-table tbody tr")).toHaveCount(1);
});
test("all workshop views and intake fit the screen and pass accessibility checks", async ({
  page,
}, info) => {
  await ready(page);
  for (const name of [
    "Overview",
    "Repair queue",
    "Schedule",
    "Parts & stock",
    "Services & prices",
    "Reports",
  ]) {
    await nav(page, name).click();
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
    expect(scan.violations, name).toEqual([]);
    if (name === "Repair queue")
      await info.attach("workshop-queue", {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
  }
  await page.getByRole("button", { name: "+ New repair", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "A new repair, a clear plan." }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("private workshop requires sign-in and saves custom intake across sign-out", async ({
  page,
}) => {
  const server = createApp({
    dataFile: join(
      process.cwd(),
      "work",
      "private-browser",
      randomUUID(),
      "records.ndjson",
    ),
    operatorKey: "private-browser-test-key",
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(origin + "/workshop.html");
    await expect(heading(page)).toHaveText("Your bench. Your workspace.");
    await page
      .getByLabel("Workshop key", { exact: true })
      .fill("private-browser-test-key");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(heading(page)).toHaveText("A clear bench. A better day.");
    await page
      .getByRole("button", { name: "+ New repair", exact: true })
      .click();
    await page
      .getByLabel("Customer name", { exact: true })
      .fill("Private test rider");
    await page
      .getByLabel("Bike / model", { exact: true })
      .fill("Private test touring bike");
    await page
      .getByLabel("Reported concern", { exact: true })
      .fill("Brake squeak on steep descents");
    await page
      .getByRole("button", { name: "Create repair", exact: true })
      .click();
    await expect(heading(page)).toHaveText("Private test touring bike");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(heading(page)).toHaveText("Your bench. Your workspace.");
    await page
      .getByLabel("Workshop key", { exact: true })
      .fill("private-browser-test-key");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(heading(page)).toHaveText("Private test touring bike");
  } finally {
    await page.goto("about:blank");
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
});
