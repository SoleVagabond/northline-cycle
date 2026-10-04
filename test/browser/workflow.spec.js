import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const repair = (page) => page.locator(".repair-detail");
const stage = (page) => repair(page).locator(".stage-badge");
const notice = (page) => page.locator("#tracker-status");
const workshop = (page) =>
  page.getByRole("button", { name: "Workshop view", exact: true });
const customer = (page) =>
  page.getByRole("button", { name: "Customer view", exact: true });
const chooseHybrid = (page) =>
  page.getByRole("button", { name: /NL-2403.*Everyday hybrid/ });

test("inline view handoffs preserve the repair and explain when approval is needed", async ({
  page,
}) => {
  await ready(page);
  await chooseHybrid(page).click();
  await expect(repair(page)).toContainText("Approval follows inspection");
  await page
    .getByRole("button", { name: "Continue in Workshop view", exact: false })
    .click();
  await expect(page.locator("#repair-title")).toBeFocused();
  await expect(stage(page)).toHaveText("Checked in");
  await expect(notice(page)).toContainText("progress has not changed");
  await page
    .getByRole("button", { name: "Start inspection", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Request customer approval", exact: false })
    .click();
  await expect(stage(page)).toHaveText("Your approval");
  await page
    .getByRole("button", { name: "Continue in Customer view", exact: false })
    .click();
  await expect(page.locator("#repair-title")).toHaveText("Everyday hybrid");
  await expect(stage(page)).toHaveText("Your approval");
  await expect(repair(page)).toContainText("Customer approval needed");
  await expect(repair(page).locator(".repair-history li")).toHaveCount(3);
});

test("ready and collected counts filter distinct saved repairs and empty results recover", async ({
  page,
}) => {
  await ready(page);
  await page
    .getByRole("button", { name: "0 Ready to collect", exact: true })
    .click();
  await expect(page.locator(".repair-empty")).toContainText(
    "No repairs ready to collect",
  );
  await page
    .getByRole("button", { name: "Show all repairs", exact: true })
    .click();
  await page
    .getByRole("button", { name: /NL-2402.*Weekend road bike/ })
    .click();
  await workshop(page).click();
  await page
    .getByRole("button", { name: "Move to ride check", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Mark ready to collect", exact: false })
    .click();
  await page
    .getByRole("button", { name: "1 Ready to collect", exact: true })
    .click();
  await expect(page.locator(".repair-choice")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Mark collected", exact: false })
    .click();
  await expect(page.locator(".repair-empty")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "0 Ready to collect", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Show repairs", { exact: true })
    .selectOption("collected");
  await expect(stage(page)).toHaveText("Back on the road");
  await expect(
    page.getByRole("button", { name: "1 Collected", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".repair-choice")).toHaveCount(3);
  await page
    .getByLabel("Show repairs", { exact: true })
    .selectOption("collected");
  await expect(page.locator("#repair-title")).toHaveText("Weekend road bike");
  await expect(stage(page)).toHaveText("Back on the road");
});

test("a saved action with a lost response blocks stale actions until progress reloads", async ({
  page,
}) => {
  await ready(page);
  await chooseHybrid(page).click();
  await workshop(page).click();
  await page.route("**/api/tracker/actions", async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort("failed");
  });
  await page
    .getByRole("button", { name: "Start inspection", exact: false })
    .click();
  await expect(notice(page)).toContainText("may already be saved");
  await expect(page.locator(".saved-badge")).toHaveText(
    "Saved progress needs review",
  );
  await expect(page.locator("[data-action=advance]")).toBeDisabled();
  await page.unroute("**/api/tracker/actions");
  await page
    .getByRole("button", { name: "Reload saved progress", exact: true })
    .click();
  await expect(stage(page)).toHaveText("Inspection");
  await expect(page.locator(".saved-badge")).toHaveText("Progress saved");
  await expect(
    page.getByRole("button", {
      name: "Request customer approval",
      exact: false,
    }),
  ).toBeEnabled();
  await expect(repair(page).locator(".repair-history li")).toHaveCount(2);
});

test("the service menu can recover while retaining the rider's sample choices", async ({
  page,
}) => {
  await page.route("**/api/services", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unavailable" }),
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Reload service menu", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Sample bike", { exact: true }).selectOption("café");
  await page
    .getByLabel("What needs care?", { exact: true })
    .selectOption("gears");
  await page.unroute("**/api/services");
  await page
    .getByRole("button", { name: "Reload service menu", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Create sample repair", exact: false }),
  ).toBeEnabled();
  await expect(page.getByLabel("Sample bike", { exact: true })).toHaveValue(
    "café",
  );
  await expect(
    page.getByLabel("What needs care?", { exact: true }),
  ).toHaveValue("gears");
  await expect(
    page.getByRole("button", { name: "Reload service menu", exact: true }),
  ).toBeHidden();
});

test("pending requests lock their choices and confirmed saves show the next step", async ({
  page,
}) => {
  await ready(page);
  await choices(page);
  let release;
  const waitForRelease = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/enquiries", async (route) => {
    await waitForRelease;
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Create sample repair", exact: false })
    .click();
  try {
    await expect(
      page.getByLabel("Sample bike", { exact: true }),
    ).toBeDisabled();
    await expect(page.getByLabel("Service", { exact: true })).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Choose Full refresh", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByLabel("Add local collection", { exact: false }),
    ).toBeDisabled();
    await expect(page.locator("#request-next-step")).toBeHidden();
  } finally {
    release();
  }
  await expect(page.locator("#form-status")).toContainText(
    "saved. Estimate: $80",
  );
  await expect(page.locator("#request-next-step")).toContainText(
    "Workshop view",
  );
  await expect(
    page.getByRole("button", {
      name: "Create another sample repair",
      exact: false,
    }),
  ).toBeEnabled();
  await expect(page.getByLabel("Sample bike", { exact: true })).toBeEnabled();
  await expect(page.locator(".repair-choice")).toHaveCount(4);
});

test("a reset with a lost response offers recovery instead of promising old progress remains", async ({
  page,
}) => {
  await ready(page);
  await chooseHybrid(page).click();
  await workshop(page).click();
  await page
    .getByRole("button", { name: "Start inspection", exact: false })
    .click();
  await expect(stage(page)).toHaveText("Inspection");
  await page.route("**/api/tracker/reset", async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    await route.abort("failed");
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".demo-options summary").click();
  await page
    .getByRole("button", { name: "Reset sample repairs", exact: false })
    .click();
  await expect(notice(page)).toContainText("reset could not be confirmed");
  await expect(page.locator("[data-action=advance]")).toBeDisabled();
  await page
    .getByRole("button", { name: "Reload saved progress", exact: true })
    .click();
  await chooseHybrid(page).click();
  await expect(stage(page)).toHaveText("Checked in");
  await expect(repair(page).locator(".repair-history li")).toHaveCount(1);
});

async function ready(page) {
  await page.goto("/");
  await expect(page.locator(".repair-choice")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Create sample repair", exact: false }),
  ).toBeEnabled();
}
async function choices(page) {
  await page.getByLabel("Sample bike", { exact: true }).selectOption("café");
  await page
    .getByLabel("What needs care?", { exact: true })
    .selectOption("brakes");
  await page.getByLabel("Service", { exact: true }).selectOption("tune");
  await page.getByLabel("Add local collection", { exact: false }).check();
}

test("request, approval and collection survive a reload with seven journal entries", async ({
  page,
}, testInfo) => {
  await ready(page);
  await choices(page);
  await expect(page.locator("#estimate-value")).toHaveText("$80");
  await page
    .getByRole("button", { name: "Create sample repair", exact: false })
    .click();
  await expect(page.locator("#form-status")).toContainText(
    "saved. Estimate: $80",
  );
  await page
    .getByRole("button", { name: "Track this sample repair", exact: false })
    .click();
  await expect(stage(page)).toHaveText("Checked in");
  await page
    .getByRole("button", { name: "Start inspection", exact: false })
    .click();
  await expect(stage(page)).toHaveText("Inspection");
  await page
    .getByRole("button", { name: "Request customer approval", exact: false })
    .click();
  await expect(stage(page)).toHaveText("Your approval");
  await expect(repair(page)).toContainText("Waiting for the rider’s approval");
  await expect(page.locator("[data-action=advance]")).toHaveCount(0);
  await customer(page).click();
  await page
    .getByRole("button", { name: "Approve $80 estimate", exact: false })
    .click();
  await expect(stage(page)).toHaveText("On the workbench");
  await workshop(page).click();
  for (const [action, result] of [
    ["Move to ride check", "Ride check"],
    ["Mark ready to collect", "Ready to collect"],
    ["Mark collected", "Back on the road"],
  ]) {
    await page.getByRole("button", { name: action, exact: false }).click();
    await expect(stage(page)).toHaveText(result);
  }
  await expect(repair(page).locator(".repair-history li")).toHaveCount(7);
  await page.reload();
  await expect(stage(page)).toHaveText("Back on the road");
  await expect(page.locator("#repair-title")).toHaveText("Café cruiser");
  await expect(repair(page).locator(".repair-history li")).toHaveCount(7);
  await page
    .locator("#tracker")
    .screenshot({ path: testInfo.outputPath("collected-repair.png") });
});

test("a lost response retries the saved request without creating a second repair", async ({
  page,
}) => {
  await ready(page);
  await choices(page);
  let saved;
  let submissions = 0;
  const references = [];
  await page.route("**/api/enquiries", async (route) => {
    references.push(route.request().postDataJSON().requestId);
    const response = await route.fetch();
    if (submissions++ === 0) {
      saved = await response.json();
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  const submit = page.getByRole("button", {
    name: "Create sample repair",
    exact: false,
  });
  await submit.click();
  await expect(page.locator("#form-status")).toContainText(
    "repair may already be saved",
  );
  await expect(page.getByLabel("Sample bike", { exact: true })).toHaveValue(
    "café",
  );
  await submit.click();
  await expect(page.locator("#form-status")).toContainText(saved.repairId);
  expect(references).toHaveLength(2);
  expect(references[0]).toBe(references[1]);
  await expect(page.locator(".repair-choice")).toHaveCount(4);
  const persisted = await page.request.get("/api/tracker");
  expect((await persisted.json()).workspace.jobs).toHaveLength(4);
});

test("two tabs reload a competing saved update instead of skipping a workflow stage", async ({
  page,
  context,
}) => {
  await ready(page);
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.locator(".repair-choice")).toHaveCount(3);
  for (const view of [page, other]) {
    await chooseHybrid(view).click();
    await workshop(view).click();
  }
  await page
    .getByRole("button", { name: "Start inspection", exact: false })
    .click();
  await expect(stage(page)).toHaveText("Inspection");
  await other
    .getByRole("button", { name: "Start inspection", exact: false })
    .click();
  await expect(notice(other)).toContainText("changed in another view");
  await expect(stage(other)).toHaveText("Inspection");
  await expect(repair(other).locator(".repair-history li")).toHaveCount(2);
  await expect(notice(other)).toBeFocused();
  await other
    .getByRole("button", { name: "Request customer approval", exact: false })
    .click();
  await expect(stage(other)).toHaveText("Your approval");
  await expect(repair(other).locator(".repair-history li")).toHaveCount(3);
});

test("conflict plus failed refresh offers recovery without claiming the latest state loaded", async ({
  page,
}, testInfo) => {
  await ready(page);
  await chooseHybrid(page).click();
  await workshop(page).click();
  await page.route("**/api/tracker/actions", (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: "Changed elsewhere" }),
    }),
  );
  await page.route("**/api/tracker", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Temporarily unavailable" }),
    }),
  );
  await page
    .getByRole("button", { name: "Start inspection", exact: false })
    .click();
  await expect(notice(page)).toContainText("latest progress could not load");
  const reload = page.getByRole("button", {
    name: "Reload saved progress",
    exact: true,
  });
  await expect(reload).toBeEnabled();
  await expect(page.locator(".saved-badge")).toHaveText(
    "Saved progress needs review",
  );
  await expect(page.locator("[data-action=advance]")).toBeDisabled();
  await expect(notice(page)).toBeFocused();
  await page
    .locator("#tracker")
    .screenshot({ path: testInfo.outputPath("conflict-recovery.png") });
  await page.unroute("**/api/tracker");
  await page.unroute("**/api/tracker/actions");
  await reload.click();
  await expect(notice(page)).toHaveText("Latest saved progress loaded.");
  await expect(reload).toBeHidden();
  await expect(stage(page)).toHaveText("Checked in");
  await expect(page.locator("[data-action=advance]")).toBeEnabled();
});

test("separate visitors have independent saved workspaces", async ({
  page,
  browser,
}) => {
  await ready(page);
  const visitor = await browser.newContext();
  try {
    const other = await visitor.newPage();
    await other.goto(new URL("/", page.url()).href);
    await expect(other.locator(".repair-choice")).toHaveCount(3);
    await chooseHybrid(other).click();
    await chooseHybrid(page).click();
    await workshop(page).click();
    await page
      .getByRole("button", { name: "Start inspection", exact: false })
      .click();
    await expect(stage(page)).toHaveText("Inspection");
    await other.reload();
    await expect(other.locator(".repair-choice")).toHaveCount(3);
    await chooseHybrid(other).click();
    await expect(stage(other)).toHaveText("Checked in");
  } finally {
    await visitor.close();
  }
});

test("an unavailable initial workspace can recover without a page reload", async ({
  page,
}) => {
  await page.route("**/api/tracker", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unavailable" }),
    }),
  );
  await page.goto("/");
  await expect(page.locator("#tracker-app")).toContainText("could not load");
  await page.unroute("**/api/tracker");
  await page
    .getByRole("button", { name: "Reload saved progress", exact: true })
    .click();
  await expect(page.locator(".repair-choice")).toHaveCount(3);
  await expect(notice(page)).toHaveText("Latest saved progress loaded.");
});

test("keyboard navigation reaches the form and retains repair-selection focus", async ({
  page,
}) => {
  await ready(page);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
  const choose = page.getByRole("button", {
    name: "Choose Everyday tune-up",
    exact: true,
  });
  await choose.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Service", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Service", { exact: true })).toHaveValue("tune");
  const sample = chooseHybrid(page);
  await sample.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#repair-title")).toHaveText("Everyday hybrid");
  await expect(sample).toBeFocused();
});

test("initial and approved states fit the screen and pass automated accessibility checks", async ({
  page,
}, testInfo) => {
  await ready(page);
  for (const state of ["approval", "repairing"]) {
    if (state === "repairing") {
      await page
        .getByRole("button", { name: "Approve $80 estimate", exact: false })
        .click();
      await expect(stage(page)).toHaveText("On the workbench");
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
    await testInfo.attach(`accessibility-${state}`, {
      body: JSON.stringify(scan, null, 2),
      contentType: "application/json",
    });
    expect(scan.violations).toEqual([]);
    await page
      .locator("#tracker")
      .screenshot({ path: testInfo.outputPath(`layout-${state}.png`) });
  }
});
