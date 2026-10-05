import {
  staffCatalogue,
  shopSettings,
  partsCatalogue,
} from "./lib/shop-data.js";
import {
  catalogue,
  stockSummary,
  closed,
  scheduleConflicts,
} from "./lib/workshop-query.js";
import { quoteFor } from "./lib/quotes.js";
import { money } from "./lib/money.js";
import { apiPath } from "./lib/demo-session.js";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const opt = (items, selected, label = (item) => item.name) =>
  items
    .map(
      (item) =>
        `<option value="${esc(item.id)}" ${item.id === selected ? "selected" : ""}>${esc(label(item))}</option>`,
    )
    .join("");
const input = (label, name, value = "", extra = "") =>
  `<label>${label}<input name="${name}" value="${esc(value)}" ${extra}></label>`;
const textarea = (label, name, value = "", max = 400) =>
  `<label>${label}<textarea name="${name}" maxlength="${max}">${esc(value)}</textarea></label>`;
const dayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const dayPicker = (name, values) =>
  `<fieldset class="day-picker"><legend>${name === "openingDays" ? "Open days" : "Working days"}</legend>${dayNames.map((day, i) => `<label><input type="checkbox" name="${name}" value="${i}" ${values.includes(i) ? "checked" : ""}> ${day}</label>`).join("")}</fieldset>`;
const active = (value) =>
  `<label class="check-label"><input type="checkbox" name="enabled" ${value ? "checked" : ""}> Active for new work</label>`;
const submit =
  '<button class="primary-button" type="submit">Save record</button>';
const pageHeading = (title, description) =>
  `<div class="page-heading"><div><p class="eyebrow">WORKSHOP RECORDS</p><h1>${title}</h1><p>${description}</p></div></div>`;
export function peoplePage(workspace) {
  return (
    pageHeading(
      "Customers & bikes",
      "A bike's history stays together across workshop visits. Existing repairs were imported individually; matching names are never silently merged.",
    ) +
    `<div class="records-layout"><section class="panel"><h2>Customer directory</h2><label>Find a customer or bike<input type="search" id="people-search" placeholder="Name, bike or serial number"></label><div id="people-list">${workspace.customers
      .map((customer) => {
        const bikes = workspace.bikes.filter(
          (bike) => bike.customerId === customer.id,
        );
        return `<details class="record-card" data-person-search="${esc([customer.name, ...bikes.flatMap((bike) => [bike.name, bike.serial])].join(" ").toLowerCase())}"><summary>${esc(customer.name)} <small>${bikes.length} bike${bikes.length === 1 ? "" : "s"}</small></summary><p class="muted">${esc([customer.email, customer.phone].filter(Boolean).join(" · ") || "No contact details recorded")}</p>${bikes
          .map((bike) => {
            const jobs = workspace.jobs
              .filter((job) => job.recordBikeId === bike.id)
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
            return `<section class="bike-record"><h3>${esc(bike.name)}</h3><p>${esc(bike.serial ? "Serial: " + bike.serial : "Serial not recorded")}</p>${bike.notes ? `<p>${esc(bike.notes)}</p>` : ""}<button class="quiet-button" data-returning-bike="${esc(bike.id)}">New repair for this bike</button><h4>Repair history · ${jobs.length}</h4>${jobs.map((job) => `<a class="compact-job" href="#repair/${esc(job.id)}"><div><strong>${esc(job.id)}</strong><small>${esc(job.issue)}</small></div><div><strong>${money(job.estimate)}</strong><small>${esc(job.status.replaceAll("_", " "))}</small></div></a>`).join("") || '<p class="muted">No repairs yet.</p>'}<details class="editor-section"><summary>Edit bike details</summary>${bikeForm(workspace, bike)}</details></section>`;
          })
          .join(
            "",
          )}<details class="editor-section"><summary>Edit customer details</summary>${customerForm(customer)}</details></details>`;
      })
      .join(
        "",
      )}</div><p id="people-empty" hidden>No matching records. Try another name, bike or serial.</p></section><div class="detail-stack"><section class="panel"><h2>Add a customer</h2><p class="muted">${workspace.expiresAt.startsWith("9999") ? "Contact details are optional." : "Use fictional details here; email addresses must end in .test."}</p>${customerForm()}</section><section class="panel"><h2>Add a bike</h2><p class="muted">Save the customer first, then link their bike.</p>${bikeForm(workspace)}</section></div></div>`
  );
}
function customerForm(customer = {}) {
  return `<form data-record-action="save-customer" class="stacked-form" ${customer.id ? `data-customer-id="${esc(customer.id)}"` : ""}>${input("Customer name", "name", customer.name, 'maxlength="80" required')}${input("Email (optional)", "email", customer.email, 'type="email" maxlength="120"')}${input("Phone (private installation only)", "phone", customer.phone, 'maxlength="40"')}${submit}</form>`;
}
function bikeForm(workspace, bike = {}) {
  return `<form data-record-action="save-bike" class="stacked-form" ${bike.id ? `data-record-bike-id="${esc(bike.id)}" data-customer-id="${esc(bike.customerId)}"` : ""}><label>Customer<select name="customerId" aria-label="Customer" required ${bike.id ? 'data-gated="true" disabled' : ""}>${opt(workspace.customers, bike.customerId)}</select></label>${input("Bike / model", "name", bike.name, 'maxlength="80" required')}${input("Serial number (optional)", "serial", bike.serial, 'maxlength="80"')}${textarea("Bike notes", "notes", bike.notes)}${submit}</form>`;
}
export function settingsPage(workspace) {
  const shop = shopSettings(workspace);
  const conflicts = scheduleConflicts(workspace);
  return (
    pageHeading(
      "Shop & team",
      "Set opening days, hours and each mechanic's availability. These settings guide future scheduling; review already-planned jobs after changing them.",
    ) +
    `<div class="records-layout"><section class="panel"><h2>Shop settings</h2><form class="stacked-form" data-record-action="save-shop">${input("Shop name", "name", shop.name, 'maxlength="80" required')}<div class="form-grid">${input("Opens", "opens", shop.opens, 'type="time" required')}${input("Closes", "closes", shop.closes, 'type="time" required')}</div>${dayPicker("openingDays", shop.openingDays)}${submit}</form><p class="quote-footnote">Scheduling uses America/New_York. Hours describe opening times; individual bench budgets describe productive work capacity.</p></section><section class="panel"><h2>Add a mechanic</h2>${staffForm()}</section></div>${conflicts.length ? `<section class="panel schedule-review"><h2>Existing plans need review</h2><p>Availability changed. These repairs were preserved and need a new plan.</p>${conflicts.map((item) => `<a class="compact-job" href="#repair/${esc(item.jobId)}"><div><strong>${esc(item.bike)}</strong><small>${esc(item.dueDate)}</small></div><span>${esc(item.reasons.join("; "))}</span></a>`).join("")}</section>` : ""}<div class="parts-grid">${staffCatalogue(
      workspace,
    )
      .map(
        (staff) =>
          `<section class="panel"><h2>${esc(staff.name)}</h2><p>${esc(staff.specialty)} · ${staff.enabled ? "Active" : "Inactive"}</p><details class="editor-section"><summary>Edit availability</summary>${staffForm(staff)}</details></section>`,
      )
      .join("")}</div>`
  );
}
function staffForm(
  staff = {
    capacity: 360,
    workDays: [1, 2, 3, 4, 5],
    unavailableDates: [],
    enabled: true,
  },
) {
  return `<form class="stacked-form" data-record-action="save-staff" ${staff.id ? `data-mechanic-id="${esc(staff.id)}"` : ""}>${input("Mechanic name", "name", staff.name, 'maxlength="80" required')}${input("Specialty", "specialty", staff.specialty, 'maxlength="100" required')}${input("Daily bench budget (minutes)", "capacity", staff.capacity, 'type="number" min="1" max="480" required')}${dayPicker("workDays", staff.workDays)}${textarea("Time off — one date per line (YYYY-MM-DD)", "unavailableDates", staff.unavailableDates.join("\n"), 1000)}${active(staff.enabled)}${submit}</form>`;
}
export function serviceForm(service = { enabled: true, includes: [] }) {
  return `<form class="stacked-form" data-record-action="save-service" ${service.id ? `data-service-id="${esc(service.id)}"` : ""}>${input("Service name", "name", service.name, 'maxlength="80" required')}${input("Price applies to", "unit", service.unit, 'maxlength="100" required placeholder="Per brake, per wheel or per bike"')}${textarea("Scope and exclusions", "description", service.description)}${textarea("Included tasks — one per line", "includes", service.includes.join("\n"), 1000)}${input("Starting price ($)", "price", service.price, 'type="number" min="0" max="5000" step="0.01" required')}${active(service.enabled)}${submit}</form>`;
}
export function partForm(part = { enabled: true, reorderAt: 2 }) {
  return `<form class="stacked-form" data-record-action="save-part" ${part.id ? `data-part-id="${esc(part.id)}"` : ""}>${input("Part name", "name", part.name, 'maxlength="80" required')}${input("SKU / manufacturer code", "sku", part.sku, 'maxlength="80" required')}${input("Model / size / compatibility", "specification", part.specification, 'maxlength="100" required')}${input("Unit price ($)", "price", part.price, 'type="number" min="0" max="5000" step="0.01" required')}${input("Reorder level", "reorderAt", part.reorderAt, 'type="number" min="0" max="100" required')}${active(part.enabled)}${submit}</form>`;
}
export function recordPanel(workspace, job, customerView) {
  if (customerView) return "";
  const bike = workspace.bikes.find((item) => item.id === job.recordBikeId);
  const past = workspace.jobs.filter(
    (item) => item.recordBikeId === job.recordBikeId && item.id !== job.id,
  );
  return `<section class="panel"><h2>Bike record</h2><p>${esc(job.rider)} · ${esc(bike?.serial || "Serial not recorded")}</p><a href="#people">Customer & bike directory →</a><p>${past.length} other repair${past.length === 1 ? "" : "s"} on this bike</p>${past.map((item) => `<a class="compact-job" href="#repair/${esc(item.id)}"><strong>${esc(item.id)}</strong><span>${esc(item.status)} · ${money(item.estimate)}</span></a>`).join("")}</section><details class="panel repair-tool" data-repair-tool="condition-${esc(job.id)}"><summary><h2>Condition & diagnosis</h2></summary>${closed(job) ? `<p>${esc(job.condition || "No intake condition recorded.")}</p><p>${esc(job.diagnosis || "No diagnosis recorded.")}</p>` : `<form class="stacked-form" data-record-action="inspection-record" data-job-id="${esc(job.id)}">${textarea("Intake condition", "condition", job.condition, 600)}${textarea("Diagnosis and findings (internal)", "diagnosis", job.diagnosis, 600)}${submit}</form>`}</details><details class="panel repair-tool" data-repair-tool="updates-${esc(job.id)}"><summary><h2>Customer updates</h2></summary><p class="muted">Only these updates and shared photos appear in the repair link. Workshop notes and diagnosis stay internal.</p>${job.updates.map((update) => `<div class="customer-update"><small>${esc(new Date(update.at).toLocaleString())}</small><p>${esc(update.note)}</p></div>`).join("") || '<p class="muted">No customer updates yet.</p>'}${closed(job) ? "" : `<form class="stacked-form" data-record-action="customer-update" data-job-id="${esc(job.id)}">${textarea("Update for the rider", "note", "", 600)}<button class="quiet-button" type="submit">Save customer update</button></form>`}</details><details class="panel repair-tool" data-repair-tool="photos-${esc(job.id)}"><summary><h2>Repair photos</h2></summary><p class="muted">PNG or JPEG, up to 1 MB each. Private unless you choose to share. Six photos per repair.</p><div class="photo-grid">${job.photos.map((photo) => `<figure><img src="${apiPath("/api/photos/")}${esc(photo.id)}" alt="${esc(photo.caption)}" loading="lazy"><figcaption>${esc(photo.caption)}<small>${photo.customerVisible ? "Shared with customer" : "Workshop only"}</small></figcaption></figure>`).join("")}</div>${closed(job) || job.photos.length >= 6 ? "" : `<form id="photo-form" class="stacked-form"><label>Choose a photo<input name="photo" type="file" accept="image/png,image/jpeg" required></label>${input("Photo description", "caption", "", 'maxlength="120" required')}<label class="check-label"><input name="customerVisible" type="checkbox"> Show this photo to the customer</label><button class="quiet-button" type="submit">Attach photo</button></form>`}</details><details class="panel repair-tool" data-repair-tool="link-${esc(job.id)}"><summary><h2>Customer repair link</h2></summary><p>Open a separate view for this repair's estimate, decision, updates and collection. Anyone holding the link can access this repair.</p><p class="muted">${job.customerAccess ? `Current link expires ${esc(new Date(job.customerAccess.expiresAt).toLocaleDateString())}.` : "No active link."} Creating another link invalidates the earlier one.</p><div class="action-buttons"><button class="quiet-button" data-create-link>Create repair link</button>${job.customerAccess ? '<button class="danger-button" data-revoke-link>Revoke link</button>' : ""}</div><div id="portal-link-result" role="status"></div></details>`;
}
export function bindRecords(
  main,
  { workspace, operation, openIntake, announce, mutate, currentJob },
) {
  main.querySelectorAll("[data-record-action]").forEach((form) =>
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      const input = { ...values, action: form.dataset.recordAction };
      for (const key of [
        "customerId",
        "recordBikeId",
        "mechanicId",
        "partId",
        "serviceId",
        "jobId",
      ])
        if (form.dataset[key]) input[key] = form.dataset[key];
      for (const key of ["price", "capacity", "reorderAt"])
        if (key in input) input[key] = Number(input[key]);
      if (["save-service", "save-part", "save-staff"].includes(input.action))
        input.enabled = new FormData(form).has("enabled");
      if (input.includes !== undefined)
        input.includes = input.includes
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
      if (input.unavailableDates !== undefined)
        input.unavailableDates = input.unavailableDates
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
      for (const key of ["workDays", "openingDays"])
        if (
          ["save-staff", "save-shop"].includes(input.action) &&
          form.querySelector(`[name="${key}"]`)
        )
          input[key] = new FormData(form).getAll(key).map(Number);
      operation(
        input,
        "Record saved. Historical repair snapshots retain their agreed details.",
      );
    }),
  );
  main.querySelector("#people-search")?.addEventListener("input", (event) => {
    let matches = 0;
    main.querySelectorAll("[data-person-search]").forEach((card) => {
      card.hidden = !card.dataset.personSearch.includes(
        event.target.value.trim().toLowerCase(),
      );
      if (!card.hidden) matches++;
    });
    main.querySelector("#people-empty").hidden = matches > 0;
  });
  main
    .querySelectorAll("[data-returning-bike]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        openIntake(undefined, button.dataset.returningBike),
      ),
    );
  main
    .querySelector("[data-create-link]")
    ?.addEventListener("click", async () => {
      const result = await operation(
        { action: "create-link", jobId: currentJob().id },
        "Repair link created. Previous links are invalid.",
      );
      if (!result?.portalFragment) return;
      const target = main.querySelector("#portal-link-result");
      if (!target) return;
      const url = location.origin + "/customer.html#" + result.portalFragment;
      target.innerHTML = `<label>Copy this repair link<input readonly value="${esc(url)}" aria-label="Customer repair link"></label><a class="quiet-button" href="${esc(url)}" target="_blank" rel="noopener">Open customer repair page ↗</a><p class="quote-footnote">Save this link now; the secret is shown only when created. No email or message was sent.</p>`;
      target
        .querySelector("input")
        .addEventListener("click", (event) => event.target.select());
    });
  main
    .querySelector("[data-revoke-link]")
    ?.addEventListener("click", () =>
      operation(
        { action: "revoke-link", jobId: currentJob().id },
        "Customer repair link revoked.",
      ),
    );
  main
    .querySelector("#photo-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const file = data.get("photo");
      if (
        !file ||
        file.size > 1048576 ||
        !["image/png", "image/jpeg"].includes(file.type)
      ) {
        announce("Choose a PNG or JPEG photo up to 1 MB.", true);
        return;
      }
      const jobId = currentJob().id;
      const reader = new FileReader();
      reader.onerror = () =>
        announce("The photo could not be read. Choose another image.", true);
      reader.onload = () =>
        mutate(
          "/api/photos",
          {
            jobId,
            caption: data.get("caption"),
            customerVisible: data.has("customerVisible"),
            data: reader.result.split(",")[1],
          },
          "Photo attached and saved.",
        );
      reader.readAsDataURL(file);
    });
}
