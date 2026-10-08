import { test as base, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../server.js";
import AxeBuilder from "@axe-core/playwright";
const test = base.extend({
  staffOrigin: async ({}, use) => {
    const folder = await mkdtemp(join(tmpdir(), "northline-role-journey-"));
    const app = createApp({
      dataFile: join(folder, "records.ndjson"),
      operatorKey: "northline-browser-test-key-only",
      legacyPrivatePaths: false,
    });
    await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
    try {
      await use(`http://127.0.0.1:${app.address().port}`);
    } finally {
      await new Promise((resolve) => app.close(resolve));
      await rm(folder, { recursive: true, force: true });
    }
  },
});
test("customer website offers services and scoped tracking with no workshop controls", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".customer-service")).toHaveCount(12);
  await expect(
    page.getByRole("button", { name: "+ New repair", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Repair queue", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Request Brake/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Request Brake/ }).click();
  await expect(page.getByLabel("Service", { exact: true })).toHaveValue(
    "brake",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("link", { name: "Staff sign-in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your bench. Your workspace." }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Workshop navigation" }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "+ New repair", exact: true }),
  ).toBeDisabled();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
test("a public repair request reaches the private staff queue and only its shared update reaches the recipient", async ({
  page,
  browser,
  staffOrigin,
}) => {
  const unique = `Boundary ${Date.now()} ${Math.random().toString(16).slice(2, 7)}`;
  await page.goto(staffOrigin + "/#request");
  await expect(page.getByLabel("Service", { exact: true })).toBeEnabled();
  await page
    .getByLabel("Your name", { exact: true })
    .fill("Fictional Boundary Rider");
  await page.getByLabel("Bike / model", { exact: true }).fill(unique);
  await page.getByLabel("Email", { exact: true }).fill("boundary@example.test");
  await page.getByLabel("Service", { exact: true }).selectOption("brake");
  await page
    .getByLabel("What needs attention?", { exact: true })
    .fill("Rear brake needs inspection");
  await page.getByRole("button", { name: "Send repair request" }).click();
  await expect(page.locator("#customer-request-status")).toHaveText(
    "Your repair request is saved. Keep the link shown below.",
  );
  const href = await page
    .getByRole("link", { name: "Open my repair", exact: false })
    .getAttribute("href");
  await page
    .getByRole("link", { name: "Open my repair", exact: false })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(unique);
  const staffContext = await browser.newContext();
  try {
    const staff = await staffContext.newPage();
    await staff.goto(new URL("/workshop.html", page.url()).href);
    await staff
      .getByLabel("Workshop key", { exact: true })
      .fill("northline-browser-test-key-only");
    await staff.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(staff.locator("#save-state")).toHaveText("All changes saved");
    await staff
      .getByRole("link", { name: "Repair queue", exact: false })
      .click();
    await staff.getByRole("link").filter({ hasText: unique }).click();
    await expect(staff.getByRole("heading", { level: 1 })).toHaveText(unique);
    await staff
      .getByLabel("Record findings or a handoff", { exact: true })
      .fill("Private inspection note for mechanic only");
    await staff.getByRole("button", { name: "Save note", exact: true }).click();
    await expect(staff.locator("#save-state")).toHaveText("All changes saved");
    await staff.getByText("Customer updates", { exact: true }).click();
    await staff
      .getByLabel("Update for the rider", { exact: true })
      .fill("We received your bike and will inspect the rear brake.");
    await staff
      .getByRole("button", { name: "Save customer update", exact: true })
      .click();
    await expect(staff.locator("#app-message")).toContainText("Record saved.");
    await page
      .getByRole("button", { name: "Refresh repair", exact: true })
      .click();
    await expect(page.locator("#customer-workspace")).toContainText(
      "We received your bike and will inspect the rear brake.",
    );
    await expect(page.locator("#customer-workspace")).not.toContainText(
      "Private inspection note",
    );
    await expect(
      page.getByRole("link", { name: /Customers & bikes/ }),
    ).toHaveCount(0);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await staff.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(
      staff.getByLabel("Workshop key", { exact: true }),
    ).toBeVisible();
    await expect(staff.locator("#workspace")).not.toContainText(unique);
    expect(
      (
        await staff.request.get(
          new URL("/api/staff/workshop", staff.url()).href,
        )
      ).status(),
    ).toBe(401);
    await page.goto(new URL("/demo/workshop.html", page.url()).href);
    await expect(page.locator("#mode-label")).toHaveText("Portfolio demo");
    await expect(page.locator("#workspace-scope")).toContainText(
      "Isolated from the private staff workspace",
    );
    await page.getByRole("link", { name: /Repair queue/ }).click();
    await expect(page.locator("#workspace")).not.toContainText(unique);
    await page.goto(new URL(href, page.url()).href);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(unique);
  } finally {
    await staffContext.close();
  }
});
test("public request failure retains choices and its request identity for an uncertain retry", async ({
  page,
}) => {
  const ids = [];
  let first = true;
  let release;
  const pending = new Promise((resolve) => (release = resolve));
  await page.route("**/api/public/enquiries", async (route) => {
    ids.push(route.request().postDataJSON().requestId);
    if (first) {
      first = false;
      await pending;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary failure" }),
      });
    } else await route.continue();
  });
  await page.goto("/#request");
  await expect(page.getByLabel("Service", { exact: true })).toBeEnabled();
  await page.getByLabel("Your name", { exact: true }).fill("Retry Sample");
  await page
    .getByLabel("Bike / model", { exact: true })
    .fill("Retry sample bicycle");
  await page.getByLabel("Service", { exact: true }).selectOption("brake");
  await page
    .getByLabel("What needs attention?", { exact: true })
    .fill("Brake inspection");
  await page.getByRole("button", { name: "Send repair request" }).click();
  await expect(page.getByLabel("Bike / model", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Service", { exact: true })).toBeDisabled();
  release();
  await expect(page.locator("#customer-request-status")).toContainText(
    "Your choices have been kept",
  );
  await expect(page.getByLabel("Bike / model", { exact: true })).toHaveValue(
    "Retry sample bicycle",
  );
  await page.getByRole("button", { name: "Send repair request" }).click();
  await expect(page.locator("#customer-request-status")).toContainText(
    "is saved",
  );
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
});
