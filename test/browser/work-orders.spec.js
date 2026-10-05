import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const ready = async (page) => {
  await page.goto("/workshop.html");
  await expect(page.locator("#save-state")).toHaveText("All changes saved");
};
const nav = async (page, name) => {
  await page
    .getByRole("navigation", { name: "Workshop navigation" })
    .getByRole("link", { name, exact: true })
    .click();
};
const save = async (page, form) => {
  await form.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.locator("#app-message")).toContainText("Record saved.");
};
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGP4/x8AAwAB//wl3FEAAAAASUVORK5CYII=",
  "base64",
);
test("returning bike, itemized work, private/shared photos and a separate recipient complete one saved approval", async ({
  page,
  browser,
}, info) => {
  await ready(page);
  await nav(page, "Customers & bikes");
  let form = page.locator('[data-record-action="save-customer"]').last();
  await form
    .getByLabel("Customer name", { exact: true })
    .fill("Taylor Example");
  await form
    .getByLabel("Email (optional)", { exact: true })
    .fill("taylor@example.test");
  await save(page, form);
  form = page.locator(
    '[data-record-action="save-bike"]:not([data-record-bike-id])',
  );
  await form
    .getByLabel("Customer", { exact: true })
    .selectOption({ label: "Taylor Example" });
  await form
    .getByLabel("Bike / model", { exact: true })
    .fill("Taylor's gravel bike");
  await form
    .getByLabel("Serial number (optional)", { exact: true })
    .fill("FICTIONAL-GB-102");
  await save(page, form);
  const customer = page.locator(".record-card").filter({
    has: page.locator("summary").filter({ hasText: "Taylor Example" }),
  });
  await customer.locator("summary").first().click();
  await customer
    .getByRole("button", { name: "New repair for this bike", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Repair type", { exact: true })
    .selectOption("brake");
  await page
    .getByLabel("Intake condition (optional)", { exact: true })
    .fill("Scratched grip; no accessories left");
  await page
    .getByRole("button", { name: "Create repair", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Taylor's gravel bike",
  );
  await page
    .getByRole("button", { name: "Start inspection", exact: true })
    .click();
  await page.getByText("Revise the estimate", { exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "Itemize services on this work order",
      exact: true,
    })
    .check();
  await page
    .getByLabel("Charge for Brake service", { exact: true })
    .fill("40.25");
  await page
    .getByLabel("Service quantity for Brake service", { exact: true })
    .fill("2");
  await page.locator('[name="service-wheel"]').check();
  await page.getByLabel("Charge for Wheel true", { exact: true }).fill("35.10");
  await page.getByRole("checkbox", { name: /Replacement brake pads/ }).check();
  await page
    .getByLabel("Specification for Replacement brake pads", { exact: true })
    .fill("B05S-RX, both calipers inspected");
  await page
    .getByLabel("Quantity for Replacement brake pads", { exact: true })
    .fill("2");
  await expect(page.locator("#estimate-preview")).toContainText("$165.60");
  await page
    .getByRole("button", {
      name: "Request approval for revised estimate",
      exact: true,
    })
    .click();
  await expect(page.locator(".quote-total")).toHaveText("$165.60");
  await page
    .locator("#note-form textarea")
    .fill("Internal supplier discussion");
  await page
    .locator("#note-form")
    .getByRole("button", { name: "Save note", exact: true })
    .click();
  await page.getByText("Condition & diagnosis", { exact: true }).click();
  form = page.locator('[data-record-action="inspection-record"]');
  await form
    .getByLabel("Diagnosis and findings (internal)", { exact: true })
    .fill("Private mechanical findings");
  await save(page, form);
  await page.getByText("Customer updates", { exact: true }).click();
  form = page.locator('[data-record-action="customer-update"]');
  await form
    .getByLabel("Update for the rider", { exact: true })
    .fill("The brakes and rear wheel are ready for your approval.");
  await form
    .getByRole("button", { name: "Save customer update", exact: true })
    .click();
  await expect(page.locator("#app-message")).toContainText("Record saved");
  await page.getByText("Repair photos", { exact: true }).click();
  for (const shared of [false, true]) {
    await page.locator('#photo-form input[type="file"]').setInputFiles({
      name: "wear.png",
      mimeType: "image/png",
      buffer: image,
    });
    await page
      .getByLabel("Photo description", { exact: true })
      .fill(shared ? "Rear pad wear" : "Internal intake photo");
    if (shared)
      await page
        .getByRole("checkbox", {
          name: "Show this photo to the customer",
          exact: true,
        })
        .check();
    await page
      .getByRole("button", { name: "Attach photo", exact: true })
      .click();
    await expect(page.locator("#app-message")).toContainText("Photo attached");
  }
  await page.getByText("Customer repair link", { exact: true }).click();
  await page
    .getByRole("button", { name: "Create repair link", exact: true })
    .click();
  const link = page.getByRole("textbox", {
    name: "Customer repair link",
    exact: true,
  });
  await expect(link).toBeVisible();
  const url = await link.inputValue();
  const context = await browser.newContext({ viewport: page.viewportSize() });
  const recipient = await context.newPage();
  try {
    await recipient.goto(url);
    await expect(recipient.getByRole("heading", { level: 1 })).toHaveText(
      "Taylor's gravel bike",
    );
    await expect(recipient.locator("main")).not.toContainText(
      /Internal supplier|Private mechanical|Internal intake/,
    );
    await expect(recipient.locator(".photo-grid img")).toHaveCount(1);
    await expect(recipient.locator(".quote-total")).toHaveText("$165.60");
    await expect
      .poll(() =>
        recipient
          .locator(".photo-grid img")
          .evaluate((image) => image.naturalWidth),
      )
      .toBe(1);
    expect(
      (await context.request.get(new URL("/api/workshop", url).href)).status(),
    ).toBe(401);
    expect(
      (
        await new AxeBuilder({ page: recipient })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await recipient.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await recipient
      .getByRole("button", { name: "Approve $165.60 estimate", exact: true })
      .click();
    await expect(recipient.locator("#customer-message")).toHaveText(
      "Your estimate approval is saved.",
    );
    await expect(recipient.locator(".detail-summary")).toContainText(
      "approved",
    );
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Move to ride check", exact: true }),
    ).toBeVisible();
    await page.reload();
    await page.getByText("Customer repair link", { exact: true }).click();
    await page.getByText("Repair photos", { exact: true }).click();
    await expect(page.locator(".photo-grid img")).toHaveCount(2);
    await page
      .getByRole("button", { name: "Revoke link", exact: true })
      .click();
    await recipient
      .getByRole("button", { name: "Refresh repair", exact: true })
      .click();
    await expect(recipient.getByRole("heading", { level: 1 })).toHaveText(
      "Repair link unavailable",
    );
    await nav(page, "Customers & bikes");
    const card = page.locator(".record-card").filter({
      has: page.locator("summary").filter({ hasText: "Taylor Example" }),
    });
    await card.locator("summary").first().click();
    await expect(card).toContainText("Repair history · 1");
    await card
      .getByRole("button", { name: "New repair for this bike", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Create repair", exact: true })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Taylor's gravel bike",
    );
    await expect(
      page
        .getByRole("heading", { name: "Bike record", exact: true })
        .locator(".."),
    ).toContainText("1 other repair");
    await info.attach("itemized-work-order", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  } finally {
    await context.close();
  }
});
test("service and part configuration create usable catalogue records and preserve cents", async ({
  page,
}) => {
  await ready(page);
  await nav(page, "Services & prices");
  let form = page.locator(
    '[data-record-action="save-service"]:not([data-service-id])',
  );
  await form
    .getByLabel("Service name", { exact: true })
    .fill("Tubeless refresh");
  await form.getByLabel("Price applies to", { exact: true }).fill("Per wheel");
  await form
    .getByLabel("Scope and exclusions", { exact: true })
    .fill("Inspect valve and sealant; replacement tyre excluded.");
  await form
    .getByLabel("Included tasks — one per line", { exact: true })
    .fill("Inspect sealant\nInspect valve");
  await form.getByLabel("Starting price ($)", { exact: true }).fill("29.95");
  await save(page, form);
  const service = page.locator(".service-card-app").filter({
    has: page.getByRole("heading", { name: "Tubeless refresh", exact: true }),
  });
  await expect(service).toContainText("From $29.95");
  await service
    .getByRole("button", { name: "Create Tubeless refresh", exact: true })
    .click();
  await expect(page.locator("#intake-total")).toHaveText("$29.95");
  await page
    .getByRole("button", { name: "Create repair", exact: true })
    .click();
  await expect(page.locator(".quote-total")).toHaveText("$29.95");
  await nav(page, "Parts & stock");
  form = page.locator('[data-record-action="save-part"]:not([data-part-id])');
  await form.getByLabel("Part name", { exact: true }).fill("Continental tube");
  await form
    .getByLabel("SKU / manufacturer code", { exact: true })
    .fill("CON-700-28");
  await form
    .getByLabel("Model / size / compatibility", { exact: true })
    .fill("700C 28-32mm, 42mm Presta");
  await form.getByLabel("Unit price ($)", { exact: true }).fill("8.95");
  await save(page, form);
  let part = page.locator(".stock-card").filter({
    has: page.getByRole("heading", { name: "Continental tube", exact: true }),
  });
  await expect(part).toContainText("$8.95 / unit");
  await part
    .getByRole("spinbutton", {
      name: "Units received for Continental tube",
      exact: true,
    })
    .fill("6");
  await part
    .getByRole("button", { name: "Receive stock", exact: true })
    .click();
  await expect(page.locator("#app-message")).toContainText(
    "Stock receipt saved",
  );
  await page.reload();
  await expect(part.locator(".stock-counts strong").first()).toHaveText("6");
  await nav(page, "Shop & team");
  form = page.locator('[data-record-action="save-shop"]');
  await form
    .getByLabel("Shop name", { exact: true })
    .fill("Northline Test Workshop");
  await form.getByLabel("Opens", { exact: true }).fill("10:00");
  await form.getByLabel("Closes", { exact: true }).fill("18:00");
  await save(page, form);
  await expect(page.getByLabel("Shop name", { exact: true })).toHaveValue(
    "Northline Test Workshop",
  );
});
test("a recipient recovers from a stale estimate and a lost approval response without deciding twice", async ({
  page,
  browser,
}) => {
  await ready(page);
  await page.goto("/workshop.html#repair/NL-2401");
  await page.getByText("Customer repair link", { exact: true }).click();
  await page
    .getByRole("button", { name: "Create repair link", exact: true })
    .click();
  const url = await page
    .getByRole("textbox", { name: "Customer repair link", exact: true })
    .inputValue();
  const context = await browser.newContext();
  const recipient = await context.newPage();
  try {
    await recipient.goto(url);
    await expect(
      recipient.getByRole("button", {
        name: "Approve $80 estimate",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByText("Revise the estimate", { exact: true }).click();
    await page.getByLabel("Service charge ($)", { exact: true }).fill("80.50");
    await page
      .getByRole("button", {
        name: "Request approval for revised estimate",
        exact: true,
      })
      .click();
    await recipient
      .getByRole("button", { name: "Approve $80 estimate", exact: true })
      .click();
    await expect(recipient.locator("#customer-message")).toContainText(
      "estimate changed",
    );
    await expect(
      recipient.getByRole("button", {
        name: "Approve $80 estimate",
        exact: true,
      }),
    ).toBeDisabled();
    await recipient
      .getByRole("button", { name: "Refresh repair", exact: true })
      .click();
    await expect(
      recipient.getByRole("button", {
        name: "Approve $95.50 estimate",
        exact: true,
      }),
    ).toBeVisible();
    await recipient.route("**/api/customer/decision", async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort("failed");
    });
    await recipient
      .getByRole("button", { name: "Approve $95.50 estimate", exact: true })
      .click();
    await expect(
      recipient.getByRole("button", {
        name: "Approve $95.50 estimate",
        exact: true,
      }),
    ).toBeDisabled();
    await recipient.unroute("**/api/customer/decision");
    await recipient
      .getByRole("button", { name: "Refresh repair", exact: true })
      .click();
    await expect(recipient.locator(".detail-summary")).toContainText(
      "approved",
    );
    await expect(recipient.locator("[data-decision]")).toHaveCount(0);
    await page.goto("/workshop.html#repair/NL-2402");
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page.getByText("Customer repair link", { exact: true }).click();
    await page
      .getByRole("button", { name: "Create repair link", exact: true })
      .click();
    const otherLink = await page
      .getByRole("textbox", { name: "Customer repair link", exact: true })
      .inputValue();
    await recipient.goto(otherLink);
    await expect(recipient.getByRole("heading", { level: 1 })).toHaveText(
      "Weekend road bike",
    );
    await expect(recipient.locator(".quote-total")).toHaveText("$45");
  } finally {
    await context.close();
  }
});
test("new record screens, expanded scope forms and selected part controls work at narrow widths and pass accessibility checks", async ({
  page,
}) => {
  await ready(page);
  for (const name of [
    "Customers & bikes",
    "Shop & team",
    "Services & prices",
    "Parts & stock",
  ]) {
    await nav(page, name);
    if (name === "Services & prices")
      await page
        .getByText("Edit service scope", { exact: true })
        .first()
        .click();
    if (name === "Parts & stock")
      await page
        .getByText("Edit part details", { exact: true })
        .first()
        .click();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
      name,
    ).toEqual([]);
  }
  await page.goto("/workshop.html#repair/NL-2401");
  await page.getByText("Revise the estimate", { exact: true }).click();
  await expect(
    page.getByLabel("Specification for Replacement brake pads", {
      exact: true,
    }),
  ).toBeHidden();
  await page.getByRole("checkbox", { name: /Replacement brake pads/ }).check();
  await expect(
    page.getByLabel("Specification for Replacement brake pads", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: /Replacement brake pads/ })
    .uncheck();
  await expect(
    page.getByLabel("Specification for Replacement brake pads", {
      exact: true,
    }),
  ).toBeHidden();
  await page
    .getByRole("checkbox", {
      name: "Itemize services on this work order",
      exact: true,
    })
    .check();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
