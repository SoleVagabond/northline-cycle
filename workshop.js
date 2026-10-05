import { ensureWorkspace, apiData } from "./lib/demo-session.js";
import {
  peoplePage,
  settingsPage,
  serviceForm,
  partForm,
  recordPanel,
  bindRecords,
} from "./records-ui.js";
import { staffCatalogue, partsCatalogue } from "./lib/shop-data.js";
import { money, sumMoney, multiplyMoney } from "./lib/money.js";
import {
  repairTypes,
  mechanics,
  qualityChecks,
  qualityComplete,
  workshopDate,
} from "./lib/services.js";
import {
  demoBikes,
  demoIssues,
  stages,
  exceptionStages,
  workflowStage,
} from "./lib/repairs.js";
import { quoteFor, quoteReasons, partOptions } from "./lib/quotes.js";
import {
  queueJobs,
  workshopReport,
  catalogue,
  stockSummary,
  closed,
  plannedMinutes,
} from "./lib/workshop-query.js";

const main = document.querySelector("#workspace");
const feedback = document.querySelector("#app-message");
const saveState = document.querySelector("#save-state");
const newDialog = document.querySelector("#new-dialog");
const newForm = document.querySelector("#new-form");
const confirmDialog = document.querySelector("#confirm-dialog");
let workspace;
let busy = false;
let uncertain = false;
let customerView = false;
let privateMode = false;
let intakeReference;
let calendarStart = workshopDate();
const filters = { search: "", status: "all", priority: "all", sort: "due" };
const initialPreset = location.hash.slice(1).split("/");
if (
  initialPreset[0] === "queue" &&
  ["active", "approval", "ready", "waiting_parts"].includes(initialPreset[1])
)
  filters.status = initialPreset[1];
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const today = () => workshopDate();
const dateLabel = (value) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(value + "T12:00:00Z"))
    : "Not scheduled";
const stamp = (value) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
const typeFor = (job) =>
  job.serviceSnapshot ||
  catalogue(workspace).find((item) => item.id === job.serviceId);
const stateFor = (job) =>
  [...stages, ...exceptionStages].find((item) => item.id === job.status);
const pill = (job) =>
  `<span class="status-pill ${esc(job.status)}">${esc(stateFor(job)?.label || job.status)}</span>`;
const options = (items, selected, label = (item) => item.name || item.label) =>
  items
    .map(
      (item) =>
        `<option value="${esc(item.id)}" ${item.id === selected ? "selected" : ""}>${esc(label(item))}</option>`,
    )
    .join("");
const empty = (
  title,
  description,
  action = '<button class="primary-button" data-new>+ New repair</button>',
) =>
  `<div class="empty-state"><span aria-hidden="true">◇</span><h2>${esc(title)}</h2><p>${esc(description)}</p>${action}</div>`;
const heading = (eyebrow, title, description, actions = "") =>
  `<div class="page-heading"><div><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="page-heading-actions">${actions}</div></div>`;
const stats = (items) =>
  `<div class="stats-grid">${items.map(([label, value, detail, route]) => `<div class="stat"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small>${route ? `<a href="#${route}">View repairs →</a>` : ""}</div>`).join("")}</div>`;
const compactJob = (job) =>
  `<a class="compact-job" href="#repair/${esc(job.id)}"><div><strong>${esc(job.bike)}</strong><small>${esc(typeFor(job).name)} · ${money(job.estimate)} · ${esc(job.rider)}</small></div><div>${pill(job)}<small class="${job.dueDate && job.dueDate < today() && !closed(job) ? "overdue" : ""}">${esc(dateLabel(job.dueDate))}</small></div></a>`;

function overview() {
  const report = workshopReport(workspace);
  const active = queueJobs(workspace, { status: "active" });
  const stock = stockSummary(workspace);
  const low = stock.filter((item) => item.available <= item.reorderAt);
  return (
    heading(
      "AT A GLANCE",
      "A clear bench. A better day.",
      "See what needs a decision, what is ready to ride, and where your workshop needs attention.",
    ) +
    stats([
      [
        "Active repairs",
        report.active,
        "Checked in through collection",
        "queue/active",
      ],
      [
        "Awaiting approval",
        report.awaitingApproval,
        "Customer decision needed",
        "queue/approval",
      ],
      [
        "Ready to collect",
        report.ready,
        "Ride checks completed",
        "queue/ready",
      ],
      [
        "Waiting for parts",
        report.waitingParts,
        "Approved work on hold",
        "queue/waiting_parts",
      ],
    ]) +
    `<div class="dashboard-grid"><section class="panel"><div class="panel-heading"><div><h2>Next on the bench</h2><p>High priority first, then the earliest planned work date.</p></div><a href="#queue">All repairs →</a></div>${active.length ? active.slice(0, 5).map(compactJob).join("") : empty("The bench is clear", "Create a repair to start the next job.")}</section><div class="detail-stack"><section class="panel"><div class="panel-heading"><div><h2>Today's workload</h2><p>Job-specific budgets against the planning limit. Unestimated jobs still need assessment.</p></div><a href="#schedule">Schedule →</a></div>${staffCatalogue(
      workspace,
    )
      .filter((item) => item.enabled)
      .map((mechanic) => {
        const jobs = active.filter(
          (job) => job.mechanicId === mechanic.id && job.dueDate === today(),
        );
        const minutes = jobs.reduce((n, job) => n + plannedMinutes(job), 0);
        return `<div class="workload-row"><div><strong>${esc(mechanic.name)}</strong><small>${minutes} / ${mechanic.capacity} min budgeted · ${jobs.filter((job) => !job.benchMinutes).length} unestimated</small></div><meter min="0" max="${mechanic.capacity}" value="${minutes}" aria-label="${esc(mechanic.name)} planned workload">${minutes} minutes</meter></div>`;
      })
      .join(
        "",
      )}</section><section class="panel"><div class="panel-heading"><div><h2>Parts to replenish</h2><p>Available stock after repair reservations.</p></div><a href="#parts">Manage stock →</a></div>${low.length ? low.map((part) => `<div class="stock-alert"><span>${esc(part.name)}</span><strong>${part.available} available</strong></div>`).join("") : '<p class="muted">All parts are above their reorder level.</p>'}</section></div></div>`
  );
}
function queueTable(jobs) {
  if (!jobs.length)
    return empty(
      "No repairs match",
      "Try another status, priority or search term. Your other repairs are still saved.",
      '<button class="quiet-button" id="clear-filters">Clear filters</button>',
    );
  return `<table class="repair-table"><thead><tr><th scope="col">Repair & bike</th><th scope="col">Repair type</th><th scope="col">Status</th><th scope="col">Planned work / mechanic</th><th scope="col">Estimate</th></tr></thead><tbody>${jobs.map((job) => `<tr><td><a href="#repair/${esc(job.id)}"><span class="reference">${esc(job.id)}</span><strong>${esc(job.bike)}</strong><small>${esc(job.rider)}${job.priority === "high" ? " · HIGH PRIORITY" : ""}</small></a></td><td data-label="Repair type">${esc(typeFor(job).name)}<small>${esc(typeFor(job).unit)}</small></td><td data-label="Status">${pill(job)}</td><td data-label="Planned work / mechanic"><span class="${job.dueDate && job.dueDate < today() && !closed(job) ? "overdue" : ""}">${esc(dateLabel(job.dueDate))}</span><small>${esc(job.mechanic || "Unassigned")}</small></td><td data-label="Estimate" class="table-money">${money(job.estimate)}<small>${job.payment ? "Payment recorded" : quoteFor(job).decision === "approved" ? "Approved" : "Not approved"}</small></td></tr>`).join("")}</tbody></table><p class="result-count">${jobs.length} of ${workspace.jobs.length} repairs · Prices include quoted parts and collection.</p>`;
}
function queue() {
  return (
    heading(
      "REPAIR OPERATIONS",
      "Every job, in view.",
      "Repair types, prices, riders and the next handoff — without hunting through separate screens.",
      '<button class="quiet-button" data-export="csv">Export queue ↓</button>',
    ) +
    `<div class="queue-toolbar"><label>Search repairs<input id="queue-search" type="search" value="${esc(filters.search)}" placeholder="Bike, rider, repair type or reference"></label><label>Status<select id="queue-status" aria-label="Status">${options([{ id: "all", name: "All statuses" }, { id: "active", name: "Active repairs" }, { id: "overdue", name: "Overdue" }, ...stages.map((s) => ({ id: s.id, name: s.label })), ...exceptionStages.map((s) => ({ id: s.id, name: s.label }))], filters.status)}</select></label><label>Priority<select id="queue-priority" aria-label="Priority">${options(
      [
        { id: "all", name: "All priorities" },
        { id: "high", name: "High priority" },
        { id: "routine", name: "Routine" },
      ],
      filters.priority,
    )}</select></label><label>Sort by<select id="queue-sort" aria-label="Sort by">${options(
      [
        { id: "due", name: "Priority & planned work date" },
        { id: "recent", name: "Recently updated" },
        { id: "value", name: "Highest estimate" },
      ],
      filters.sort,
    )}</select></label></div><section class="panel" id="queue-results" aria-label="Repair queue results">${queueTable(queueJobs(workspace, filters))}</section>`
  );
}
function quoteLines(quote) {
  return `<table class="quote-lines"><tbody>${quote.serviceLines ? quote.serviceLines.map((line) => `<tr><td>${esc(line.name)}<small>${esc(line.description)} · ${line.quantity} × ${money(line.unitPrice)} · ${esc(line.unit)}</small></td><td>${money(line.price)}</td></tr>`).join("") : `<tr><td>Service charge${quote.workDescription ? `<small>${esc(quote.workDescription)}</small>` : ""}</td><td>${money(quote.labour)}</td></tr>`}${quote.parts.map((part) => `<tr><td>${esc(part.name)}${part.specification ? `<small>${esc(part.specification)}</small>` : ""}${part.quantity ? `<small>${part.quantity} × ${money(part.unitPrice)}</small>` : ""}</td><td>${money(part.price)}</td></tr>`).join("")}${quote.collection ? `<tr><td>Local collection</td><td>${money(quote.collection)}</td></tr>` : ""}<tr><td><strong>Total estimate</strong></td><td>${money(quote.total)}</td></tr></tbody></table>`;
}
function actionPanel(job) {
  const quote = quoteFor(job);
  let content = "";
  if (closed(job))
    content = `<p>${job.status === "collected" ? "This bike is back on the road. Its repair record and decisions remain available." : "This repair is cancelled. Its record stays available; no further work can be recorded."}</p>`;
  else if (customerView) {
    if (job.status === "approval")
      content = `<p>Review estimate v${quote.version} of ${money(quote.total)}. Approval starts only the work shown in this estimate.</p><div class="action-buttons"><button class="primary-button" data-action="approve" data-write>Approve ${money(quote.total)} estimate</button><button class="quiet-button" data-action="decline" data-write>Decline estimate</button></div>`;
    else
      content = `<p>${job.status === "ready" ? "Your bike is ready. The workshop records collection after the handover." : job.status === "declined" ? "The workshop can offer an alternative estimate. You can also request cancellation." : "The workshop handles the next step. You can follow the saved progress here."}</p>`;
  } else if (job.status === "waiting_parts")
    content = `<p>The current estimate remains approved. Receive missing stock, then resume at the workbench.</p><ul class="included-list">${quote.parts
      .map((line) => {
        const part = stockSummary(workspace).find(
          (item) => item.id === line.id,
        );
        const required = line.quantity || 1;
        return `<li>${esc(line.name)}: ${required} needed · ${part?.available ?? 0} available${(part?.available ?? 0) < required ? ` · short by ${required - (part?.available ?? 0)}` : ""}</li>`;
      })
      .join(
        "",
      )}</ul><a class="quiet-button" href="#parts">Receive parts stock →</a><button class="primary-button" data-action="parts-arrived" data-write>Parts arrived — resume repair</button>`;
  else if (["approval", "declined"].includes(job.status))
    content = `<p>${job.status === "approval" ? "Repair work stays paused until the customer approves the current estimate." : "The customer declined. Prepare an alternative estimate or cancel this repair."}</p><button class="quiet-button" data-switch-role>Open customer view →</button>`;
  else {
    const labels = {
      received: "Start inspection",
      inspection: "Request customer approval",
      repairing: "Move to ride check",
      quality: "Mark ready to collect",
      ready: "Mark collected",
    };
    const missing = job.status === "quality" && !qualityComplete(job);
    content = `<p>${esc(stateFor(job).description)}</p>${job.status === "quality" ? `<div class="check-list">${qualityChecks.map((check) => `<button data-check="${check.id}" data-write aria-pressed="${!!job.checks?.[check.id]}"><span aria-hidden="true">${job.checks?.[check.id] ? "✓" : ""}</span>${esc(check.name)}</button>`).join("")}${job.checkExceptions?.gears ? `<p class="quote-footnote">Gear-shift check not applicable: no gear shifting fitted.</p>` : `<button class="quiet-button" data-check="gears" data-not-applicable data-write>No gear shifting fitted</button>`}</div>` : ""}<div class="action-buttons"><button class="primary-button" data-action="advance" data-write ${missing ? 'data-gated="true" disabled' : ""}>${labels[job.status]}</button>${job.status === "repairing" && quote.parts.length ? '<button class="quiet-button" data-action="wait-parts" data-write>Pause for parts</button>' : ""}</div>${missing ? '<p class="quote-footnote">Complete the safety checks. Only the gear-shift check may be recorded as not applicable on a bike without shifting.</p>' : ""}`;
  }
  return `<section class="next-action"><div class="operator-label">${closed(job) ? "REPAIR CLOSED" : customerView ? "CUSTOMER DECISION" : "NEXT WORKSHOP ACTION"}</div><h3>${esc(stateFor(job).label)}</h3>${content}</section>`;
}
function itemizedEditor(job, quote) {
  const lines = quote.serviceLines || [];
  return `<label class="check-label"><input type="checkbox" name="itemized" ${quote.serviceLines ? "checked" : ""}> Itemize services on this work order</label><div class="itemized-services" ${quote.serviceLines ? "" : "hidden"}><p class="muted">Select the work found during inspection. Adjust each charge and scope before requesting one approval.</p>${catalogue(
    workspace,
  )
    .filter((service) => service.enabled)
    .map((service) => {
      const line = lines.find((item) => item.id === service.id);
      const selected =
        !!line || (!lines.length && service.id === job.serviceId);
      return `<div class="service-line-picker" data-service-picker><label class="check-label"><input type="checkbox" name="service-${service.id}" ${selected ? "checked" : ""}> ${esc(service.name)} <small>${esc(service.unit)}</small></label><div class="service-line-fields" ${selected ? "" : "hidden"}><div class="form-grid"><label>Quantity<input type="number" name="service-qty-${service.id}" aria-label="Service quantity for ${esc(service.name)}" min="1" max="10" value="${line?.quantity || 1}"></label><label>Charge per unit ($)<input type="number" name="service-price-${service.id}" aria-label="Charge for ${esc(service.name)}" min="0" max="5000" step="0.01" value="${line?.unitPrice ?? service.price}"></label></div><label>Inspected work<textarea name="service-work-${service.id}" aria-label="Work for ${esc(service.name)}" maxlength="240">${esc(line?.description || service.includes.join("; "))}</textarea></label></div></div>`;
    })
    .join("")}</div>`;
}
function estimateEditor(job) {
  const quote = quoteFor(job);
  if (
    customerView ||
    !["inspection", "approval", "repairing", "declined"].includes(job.status)
  )
    return "";
  return `<details class="editor-section subsection"><summary>Revise the estimate</summary><form class="stacked-form" id="estimate-form"><p class="muted">Describe the inspected work, enter its service charge, and record compatible specifications for any parts. A revised estimate pauses work and needs a new customer decision.</p>${itemizedEditor(job, quote)}<label ${quote.serviceLines ? "hidden" : ""}>Service charge ($)<input type="number" name="serviceCharge" value="${quote.labour}" min="0" max="5000" step="0.01" ${quote.serviceLines ? "disabled" : "required"}></label><label ${quote.serviceLines ? "hidden" : ""}>Quoted work<textarea name="workDescription" aria-label="Quoted work" maxlength="240" ${quote.serviceLines ? "disabled" : "required"}>${esc(quote.workDescription || `${typeFor(job).name}: ${typeFor(job).includes.join("; ")}`)}</textarea></label><div>${partsCatalogue(
    workspace,
  )
    .filter((part) => part.enabled)
    .map((part) => {
      const line = quote.parts.find((item) => item.id === part.id);
      return `<div class="part-picker ${line ? "selected" : ""}"><label><input type="checkbox" name="part-${part.id}" ${line ? "checked" : ""}><span>${esc(part.name)}<br><small>${money(part.price)} / unit</small></span></label><input type="number" name="qty-${part.id}" aria-label="Quantity for ${esc(part.name)}" value="${line?.quantity || 1}" min="1" max="10" class="part-quantity" ${line ? "" : "hidden"}><label class="part-specification" ${line ? "" : "hidden"}>Part specification<input name="spec-${part.id}" aria-label="Specification for ${esc(part.name)}" value="${esc(line?.specification || part.specification || "")}" maxlength="100" placeholder="Model, size or manufacturer part number"></label></div>`;
    })
    .join(
      "",
    )}</div><label>Reason for revision<select name="reasonId" aria-label="Reason for revision">${options(quoteReasons, job.status === "declined" ? "alternative" : "inspection")}</select></label><div class="quote-preview" id="estimate-preview" aria-live="polite">Current estimate: ${money(quote.total)}</div><button class="primary-button" type="submit">Request approval for revised estimate</button></form></details>`;
}
function detail(job) {
  const service = typeFor(job);
  const quote = quoteFor(job);
  const stageIndex = stages.findIndex((item) => item.id === workflowStage(job));
  const versionLabels = {
    approved: "Approved by customer",
    declined: "Declined by customer",
    superseded: "Superseded before a decision",
    pending: "Awaiting approval",
    draft: "Draft estimate",
    cancelled: "Cancelled before a decision",
  };
  return (
    heading(
      job.id + " / " + (customerView ? "CUSTOMER VIEW" : "WORKSHOP VIEW"),
      job.bike,
      `${service.name} · ${job.rider} · ${job.issue}`,
      `<a class="quiet-button" href="#queue">← Repair queue</a><button class="quiet-button" data-switch-role>${customerView ? "Workshop view" : "Customer view"}</button><button class="quiet-button" data-print>Print repair summary</button>`,
    ) +
    `<div class="detail-grid"><div class="detail-stack"><section class="panel"><div class="panel-heading"><div><h2>${esc(service.name)}</h2><p>${esc(service.unit)}${customerView ? "" : ` · ${esc(job.mechanic || "Unassigned")}`}</p></div>${pill(job)}</div><div class="detail-summary"><div><small>Starting service price</small><strong>${money(job.basePrice ?? service.price)}</strong></div><div><small>Expected collection</small><strong>${job.expectedReadyDate ? esc(dateLabel(job.expectedReadyDate)) : "Not confirmed"}</strong></div><div><small>Priority</small><strong>${job.priority === "high" ? "High priority" : "Routine"}</strong></div></div><ol class="repair-progress" aria-label="Repair progress">${stages.map((stage, i) => `<li class="${i < stageIndex ? "done" : i === stageIndex ? "current" : ""}" ${i === stageIndex && !closed(job) ? 'aria-current="step"' : ""}><b aria-hidden="true">${i < stageIndex ? "✓" : i + 1}</b><span>${esc(stage.label)}</span></li>`).join("")}</ol>${actionPanel(job)}${estimateEditor(job)}${!closed(job) && !customerView ? `<div class="subsection"><h3>Workshop note</h3><form id="note-form" class="stacked-form"><label>Record findings or a handoff<textarea name="note" maxlength="400" required placeholder="${privateMode ? "Record findings, parts decisions or a handoff." : "Use fictional workshop details in this portfolio workspace."}"></textarea></label><div class="form-actions"><button class="quiet-button" type="submit">Save note</button></div></form></div>` : ""}${!closed(job) && ((customerView && ["received", "inspection", "approval", "declined"].includes(job.status)) || (!customerView && job.status !== "ready")) ? '<details class="editor-section subsection"><summary>Cancel this repair</summary><p class="muted">Close the job permanently and retain its history.</p><button class="danger-button" data-cancel data-write>Cancel repair</button></details>' : ""}</section><section class="panel"><div class="panel-heading"><div><h2>Repair journal</h2><p>${job.history.length} saved updates · oldest decisions remain available</p></div></div><ol class="journal">${job.history
      .filter(
        (entry) =>
          !customerView || !["schedule", "add-note"].includes(entry.action),
      )
      .slice()
      .reverse()
      .map(
        (entry) =>
          `<li><p>${esc(entry.note)}</p><small>${esc(stamp(entry.at))}${entry.role ? ` · ${entry.role === "customer" ? "Customer" : "Workshop"}` : ""}</small></li>`,
      )
      .join(
        "",
      )}</ol></section></div><div class="detail-stack"><section class="panel"><div class="panel-heading"><div><h2>Current estimate</h2><p>Version ${quote.version} · ${esc(versionLabels[quote.decision])}</p></div></div><div class="quote-total">${money(quote.total)}</div>${quoteLines(quote)}<p class="quote-footnote">${esc(quote.reason)}. Parts are itemized; collection is charged once. ${privateMode ? "Prices are in USD. Tax is not calculated; this is a repair summary." : "Prices are fictional and no tax is applied in this portfolio workspace."}</p><details class="editor-section"><summary>Estimate history · ${(job.quotes || [quote]).length} versions</summary>${(
      job.quotes || [quote]
    )
      .slice()
      .reverse()
      .map(
        (version) =>
          `<div class="estimate-version"><strong>Version ${version.version} · ${money(version.total)}</strong><p>${esc(version.reason)}</p><span class="decision">${esc(versionLabels[version.decision])}${version.decidedAt ? ` · ${esc(stamp(version.decidedAt))}` : ""}</span>${quoteLines(version)}</div>`,
      )
      .join("")}</details></section>${
      !closed(job) && !customerView
        ? `<section class="panel"><div class="panel-heading"><div><h2>Schedule & assignment</h2><p>Plan the work separately from collection. Budgets are internal estimates, not promised repair times.</p></div></div><form id="schedule-form" class="stacked-form"><label>Planned work date<input type="date" name="dueDate" min="${today()}" value="${esc(job.dueDate || today())}" required></label><label>Mechanic<select name="mechanicId" aria-label="Mechanic">${options(
            staffCatalogue(workspace).filter((item) => item.enabled),
            job.mechanicId || "alex",
            (item) => `${item.name} · ${item.specialty}`,
          )}</select></label><label>Priority<select name="priority" aria-label="Priority">${options(
            [
              { id: "routine", name: "Routine" },
              { id: "high", name: "High priority" },
            ],
            job.priority || "routine",
          )}</select></label><label>Bench time budget (minutes)<input type="number" name="benchMinutes" min="1" max="480" step="1" value="${job.benchMinutes || ""}" placeholder="Not yet estimated"></label><label>Expected collection date<input type="date" name="expectedReadyDate" min="${today()}" value="${esc(job.expectedReadyDate || "")}"></label><p class="quote-footnote">Leave collection unconfirmed until inspection and parts availability support a realistic date. Update the rider if that date changes.</p><button class="primary-button" type="submit">Save schedule</button></form></section>`
        : ""
    }${
      ["ready", "collected"].includes(job.status)
        ? `<section class="panel"><div class="panel-heading"><div><h2>Payment record</h2><p>Record an offline payment; this never charges a card.</p></div></div>${
            job.payment
              ? `<strong>${money(job.payment.amount)} recorded</strong><p class="muted">${esc(job.payment.method)} · ${esc(stamp(job.payment.at))}</p>`
              : customerView
                ? '<p class="muted">The workshop records payment after the handover.</p>'
                : `<form class="stacked-form" id="payment-form"><label>Payment method<select name="method" aria-label="Payment method">${options(
                    [
                      { id: "cash", name: "Cash" },
                      { id: "card", name: "Card — paid separately" },
                      { id: "bank", name: "Bank transfer — paid separately" },
                    ],
                    "cash",
                  )}</select></label><button class="primary-button" type="submit">Record ${money(job.estimate)} payment</button></form>`
          }</section>`
        : ""
    }<section class="panel"><h2>What this service includes</h2><ul class="included-list">${service.includes.map((item) => `<li>${esc(item)}</li>`).join("")}</ul><p class="quote-footnote">The service charge covers the listed work; compatible replacement parts are quoted after inspection. Extra work requires an approved revised estimate.</p></section>${recordPanel(workspace, job, customerView)}</div></div>`
  );
}
function schedule() {
  const dates = Array.from({ length: 3 }, (_, i) =>
    new Date(Date.parse(calendarStart) + i * 86400000)
      .toISOString()
      .slice(0, 10),
  );
  const active = queueJobs(workspace, { status: "active" });
  const unscheduled = active.filter((job) => !job.dueDate);
  return (
    heading(
      "WORKSHOP PLANNING",
      "Make room for good work.",
      "Plan work dates and job-specific bench budgets after assessment. The 480-minute limit is a planning ceiling, not a promise of eight productive hours or a collection time.",
    ) +
    `<div class="schedule-toolbar"><button class="quiet-button" data-calendar="-3">← Earlier</button><label>Schedule from<input type="date" id="calendar-date" value="${calendarStart}"></label><button class="quiet-button" data-calendar="3">Later →</button><p>${unscheduled.length} active repairs still need a date.</p></div><div class="calendar-grid">${dates
      .map((date) => {
        const jobs = active.filter((job) => job.dueDate === date);
        return `<section class="calendar-day"><h2>${date === today() ? "Today · " : ""}${esc(dateLabel(date))}</h2><p>${jobs.length} scheduled repairs · ${jobs.reduce((n, job) => n + plannedMinutes(job), 0)} min budgeted · ${jobs.filter((job) => !job.benchMinutes).length} unestimated</p>${jobs.length ? jobs.map((job) => `<a class="calendar-job ${job.priority === "high" ? "high" : ""}" href="#repair/${esc(job.id)}"><strong>${esc(job.bike)}</strong><small>${esc(typeFor(job).name)} · ${money(job.estimate)}</small><small>${esc(job.mechanic)} · ${job.benchMinutes ? `${job.benchMinutes} min budgeted` : "Not yet estimated"}${job.status === "waiting_parts" ? " · Paused for parts" : ""}${job.priority === "high" ? " · High priority" : ""}</small></a>`).join("") : '<p class="muted">No repairs scheduled. Assign a date from a repair record.</p>'}</section>`;
      })
      .join(
        "",
      )}</div><section class="panel subsection"><div class="panel-heading"><div><h2>Not yet scheduled</h2><p>Open a repair to choose a date and mechanic.</p></div></div>${unscheduled.length ? unscheduled.map(compactJob).join("") : '<p class="muted">Every active repair has a scheduled date.</p>'}</section>`
  );
}
function parts() {
  const stock = stockSummary(workspace);
  return (
    heading(
      "PARTS & INVENTORY",
      "Know what's on the shelf.",
      "These sample categories are not universal compatible parts. Record a bike-specific specification in the quote. Approval reserves stock; the ride-check stage records its use. Cancellation or revision releases reservations.",
    ) +
    `<div class="parts-grid">${stock.map((part) => `<section class="panel stock-card"><div class="panel-heading"><div><h2>${esc(part.name)}</h2><p class="stock-price">${money(part.price)} / unit · ${part.sku ? `SKU ${esc(part.sku)} · ${esc(part.specification)}` : `Sample category ${esc(part.id.toUpperCase())}`}</p></div>${part.available <= part.reorderAt ? '<span class="status-pill waiting_parts">Low stock</span>' : '<span class="status-pill">In stock</span>'}</div><div class="stock-counts"><div><strong>${part.onHand}</strong><small>ON HAND</small></div><div><strong>${part.reserved}</strong><small>RESERVED</small></div><div><strong>${part.available}</strong><small>AVAILABLE</small></div></div><form data-stock="${part.id}"><label>Units received<input name="quantity" type="number" min="1" max="50" value="1" required aria-label="Units received for ${esc(part.name)}"></label><button class="quiet-button" type="submit">Receive stock</button></form><details class="editor-section"><summary>Edit part details</summary>${partForm(part)}</details></section>`).join("")}</div><section class="panel"><h2>Add a part model</h2><p class="muted">Add a real SKU, compatible model/size and price; receive its stock separately.</p>${partForm()}</section><section class="panel"><div class="panel-heading"><div><h2>Stock movements</h2><p>Saved receipts and parts used on completed work.</p></div></div>${
      workspace.stockMovements.length
        ? `<table class="repair-table"><thead><tr><th scope="col">Part</th><th scope="col">Change</th><th scope="col">Reason</th><th scope="col">Recorded</th></tr></thead><tbody>${workspace.stockMovements
            .slice()
            .reverse()
            .slice(0, 30)
            .map(
              (entry) =>
                `<tr><td><strong>${esc(partsCatalogue(workspace).find((item) => item.id === entry.partId)?.name || entry.partId)}</strong>${entry.jobId ? `<a href="#repair/${esc(entry.jobId)}"><small>${esc(entry.jobId)}</small></a>` : ""}</td><td data-label="Change">${entry.quantity > 0 ? "+" : ""}${entry.quantity}</td><td data-label="Reason">${esc(entry.reason)}</td><td data-label="Recorded">${esc(stamp(entry.at))}</td></tr>`,
            )
            .join("")}</tbody></table>`
        : '<p class="muted">Starting stock is loaded. Receipts and repair consumption will appear here.</p>'
    }</section>`
  );
}
function catalog() {
  return (
    heading(
      "SERVICE CATALOG",
      "The work. The price. The details.",
      "Starting prices for the scope shown. Parts and additional work are quoted after inspecting the bike; collection dates are confirmed separately. Price changes apply to new jobs.",
    ) +
    `<div class="catalog-grid">${catalogue(workspace)
      .map(
        (service) =>
          `<article class="service-card-app"><div class="service-top"><span>${esc(service.category.toUpperCase().replace("-", " "))}</span><span>${service.enabled ? "Active" : "Inactive"}</span></div><h2>${esc(service.name)}</h2><p>${esc(service.description)}</p><div class="service-price">From ${money(service.price)} <small>${esc(service.unit)}</small></div><ul class="included-list">${service.includes.map((item) => `<li>${esc(item)}</li>`).join("")}</ul><button class="primary-button" data-new-service="${service.id}" ${service.enabled ? "" : "disabled"}>Create ${esc(service.name)}</button><details class="editor-section catalog-edit"><summary>Edit service price</summary><form class="stacked-form" data-catalog="${service.id}"><label>Starting service price ($)<input type="number" name="price" aria-label="Starting price for ${esc(service.name)}" value="${service.price}" min="5" max="1000" step="0.01" required></label><label class="check-label"><input type="checkbox" name="enabled" ${service.enabled ? "checked" : ""}> Active for new repairs</label><button class="quiet-button" type="submit">Save service</button></form></details><details class="editor-section"><summary>Edit service scope</summary>${serviceForm(service)}</details></article>`,
      )
      .join(
        "",
      )}</div><section class="panel"><h2>Add a service</h2><p class="muted">Define its unit, included work and exclusions. Prices do not imply repair durations.</p>${serviceForm()}</section>`
  );
}
function reports() {
  const report = workshopReport(workspace);
  const group = [...stages, ...exceptionStages].map((state) => ({
    name: state.label,
    count: workspace.jobs.filter((job) => job.status === state.id).length,
  }));
  return (
    heading(
      "WORKSHOP REPORTS",
      "The numbers behind the bench.",
      "A view of saved repairs and recorded payments. Estimate value is kept separate from money recorded as paid.",
      '<button class="quiet-button" data-export="csv">Export repairs ↓</button><button class="quiet-button" data-export="json">Export workspace ↓</button>',
    ) +
    stats([
      [
        "Completed repair value",
        money(report.completedValue),
        `${report.completed} collected repairs`,
      ],
      [
        "Payments recorded",
        money(report.recordedPayments),
        "Offline records; no external charges",
      ],
      [
        "Awaiting payment record",
        money(report.outstanding),
        "Ready and collected repairs only",
      ],
      ["Active workload", report.active, "Open repairs, including paused work"],
    ]) +
    `<div class="dashboard-grid"><section class="panel"><div class="panel-heading"><div><h2>Repairs by stage</h2><p>Counts from the current saved workspace.</p></div></div>${group.map((state) => `<div class="report-bar"><span>${esc(state.name)}</span><meter min="0" max="${Math.max(1, workspace.jobs.length)}" value="${state.count}" aria-label="${esc(state.name)} repair count">${state.count}</meter><strong>${state.count}</strong></div>`).join("")}</section><section class="panel"><div class="panel-heading"><div><h2>Repair types</h2><p>Workload and estimate value by service.</p></div></div>${repairTypes
      .map((service) => {
        const jobs = workspace.jobs.filter(
          (job) => job.serviceId === service.id && job.status !== "cancelled",
        );
        return jobs.length
          ? `<div class="stock-alert"><span>${esc(service.name)}<small class="muted"> · ${jobs.length} repairs</small></span><strong>${money(jobs.reduce((n, job) => n + job.estimate, 0))}</strong></div>`
          : "";
      })
      .join(
        "",
      )}<p class="quote-footnote">Cancelled jobs are excluded from service value. Reports describe this workspace, not business-wide sales.</p></section></div>`
  );
}

function route() {
  return (location.hash.slice(1) || "overview").split("/");
}
function currentJob() {
  return workspace.jobs.find((job) => job.id === route()[1]);
}
function announce(text, error = false) {
  feedback.textContent = text;
  feedback.dataset.error = String(error);
}
function updateControls() {
  saveState.textContent = busy
    ? "Saving…"
    : uncertain
      ? "Reload to confirm"
      : "All changes saved";
  document.querySelector("#reload").disabled = busy;
  document.querySelector("#new-repair").disabled =
    busy || uncertain || !workspace;
  if (!workspace) return;
  for (const control of document.querySelectorAll(
    "main form input, main form select, main form textarea, main form button, main [data-write], main [data-new], main [data-new-service], dialog:not(#confirm-dialog) input, dialog:not(#confirm-dialog) select, dialog:not(#confirm-dialog) button:not([data-close])",
  ))
    control.disabled = busy || uncertain || control.dataset.gated === "true";
  for (const control of newDialog.querySelectorAll("[data-close]"))
    control.disabled = busy;
  for (const button of main.querySelectorAll("[data-new-service]"))
    if (
      !catalogue(workspace).find(
        (service) => service.id === button.dataset.newService,
      ).enabled
    )
      button.disabled = true;
}
function render() {
  if (!workspace) return;
  const openTools = new Set(
    [...main.querySelectorAll("details[data-repair-tool][open]")].map(
      (item) => item.dataset.repairTool,
    ),
  );
  const [section, id] = route();
  for (const link of document.querySelectorAll("[data-route]")) {
    if (link.dataset.route === (section === "repair" ? "queue" : section))
      link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  main.innerHTML =
    section === "repair"
      ? workspace.jobs.some((job) => job.id === id)
        ? detail(currentJob())
        : heading(
            "REPAIR RECORD",
            "This repair isn't available.",
            "It may have expired or belong to a previous workspace.",
            '<a class="quiet-button" href="#queue">Open repair queue</a>',
          )
      : (
          {
            overview,
            queue,
            schedule,
            parts,
            catalog,
            reports,
            people: () => peoplePage(workspace),
            settings: () => settingsPage(workspace),
          }[section] || overview
        )();
  bind();
  main
    .querySelectorAll("details[data-repair-tool]")
    .forEach((item) => (item.open = openTools.has(item.dataset.repairTool)));
  updateControls();
}
async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    signal: AbortSignal.timeout(12000),
  });
  return apiData(
    response,
    "The workshop is temporarily unavailable. Refresh to try again.",
  );
}
async function reload() {
  if (busy) return;
  busy = true;
  updateControls();
  try {
    workspace = (await api("/api/workshop")).workspace;
    if (intakeReference) {
      const saved = workspace.jobs.find(
        (job) => job.requestId === intakeReference,
      );
      if (saved) {
        newDialog.close();
        location.hash = "repair/" + saved.id;
        intakeReference = undefined;
      }
    }
    uncertain = false;
    render();
    announce("Latest saved workshop loaded.");
  } catch (error) {
    uncertain = true;
    if (privateMode && error.status === 401) {
      workspace = undefined;
      signIn();
      return;
    }
    announce(
      error.message ||
        "The connection was interrupted. Try Refresh to load saved progress.",
      true,
    );
    if (!workspace)
      main.innerHTML = empty(
        "Your workshop couldn't load",
        "Refresh to try again. Existing records have not been confirmed.",
        '<button class="quiet-button" id="startup-retry">Try again</button>',
      );
    document.querySelector("#startup-retry")?.addEventListener("click", boot);
  } finally {
    busy = false;
    updateControls();
  }
}
async function mutate(path, input, message) {
  if (busy || uncertain) return;
  busy = true;
  updateControls();
  announce("Saving your workshop update…");
  try {
    const data = await api(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, revision: workspace.revision }),
    });
    workspace = data.workspace;
    uncertain = false;
    if (data.repairId) {
      newDialog.close();
      location.hash = "repair/" + data.repairId;
      intakeReference = undefined;
      customerView = false;
    }
    render();
    if (data.customerId && input.action === "save-customer") {
      const selector = main.querySelector(
        '[data-record-action="save-bike"]:not([data-record-bike-id]) select',
      );
      if (selector) selector.value = data.customerId;
    }
    announce(message);
    return data;
  } catch (error) {
    uncertain = ![422, 403].includes(error.status);
    const text =
      error.status === 409
        ? "Another view changed the workshop. Refresh and review its latest saved state before saving again."
        : error.status
          ? error.message
          : "The connection was interrupted. The update may already be saved. Refresh to confirm before another change.";
    announce(text, true);
    if (newDialog.open) document.querySelector("#new-error").textContent = text;
    return false;
  } finally {
    busy = false;
    updateControls();
  }
}
const operation = (input, message) =>
  mutate("/api/workshop/actions", input, message);
function repairAction(action, choices = {}) {
  const job = currentJob();
  return mutate(
    "/api/tracker/actions",
    {
      jobId: job.id,
      role: customerView ? "customer" : "workshop",
      action,
      quoteVersion: quoteFor(job).version,
      enforceChecklist: true,
      ...choices,
    },
    "Repair progress saved.",
  );
}
function formInput(form) {
  return Object.fromEntries(new FormData(form));
}
function estimateInput(form) {
  const data = formInput(form);
  return {
    ...(data.itemized
      ? {
          serviceLines: catalogue(workspace)
            .filter((service) => data[`service-${service.id}`])
            .map((service) => ({
              id: service.id,
              quantity: Number(data[`service-qty-${service.id}`]),
              unitPrice: Number(data[`service-price-${service.id}`]),
              description: data[`service-work-${service.id}`],
            })),
        }
      : {
          serviceCharge: Number(data.serviceCharge),
          workDescription: data.workDescription,
        }),
    reasonId: data.reasonId,
    partLines: partsCatalogue(workspace)
      .filter((part) => data[`part-${part.id}`])
      .map((part) => ({
        id: part.id,
        quantity: Number(data[`qty-${part.id}`]),
        specification: data[`spec-${part.id}`],
      })),
  };
}
function bind() {
  bindRecords(main, {
    workspace,
    operation,
    openIntake,
    announce,
    mutate,
    currentJob,
  });
  main
    .querySelectorAll("[data-action]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        repairAction(button.dataset.action),
      ),
    );
  main.querySelectorAll("[data-switch-role]").forEach((button) =>
    button.addEventListener("click", () => {
      customerView = !customerView;
      render();
      announce(
        `${customerView ? "Customer" : "Workshop"} view opened. ${privateMode ? "The operator records workshop actions and communicated customer decisions." : "Both views are available in the portfolio workspace."}`,
      );
    }),
  );
  main.querySelectorAll("[data-check]").forEach((button) =>
    button.addEventListener("click", () =>
      operation(
        {
          action: "check",
          jobId: currentJob().id,
          checkId: button.dataset.check,
          passed: button.hasAttribute("data-not-applicable")
            ? false
            : !currentJob().checks?.[button.dataset.check],
          ...(button.hasAttribute("data-not-applicable")
            ? { notApplicable: true }
            : {}),
        },
        "Quality check saved.",
      ),
    ),
  );
  main
    .querySelectorAll("[data-new],[data-new-service]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        openIntake(button.dataset.newService),
      ),
    );
  main
    .querySelectorAll("[data-export]")
    .forEach((button) =>
      button.addEventListener("click", () => exportData(button.dataset.export)),
    );
  main.querySelector("[data-print]")?.addEventListener("click", printSummary);
  main
    .querySelector("[data-cancel]")
    ?.addEventListener("click", () => confirmDialog.showModal());
  for (const [name, key] of [
    ["search", "search"],
    ["status", "status"],
    ["priority", "priority"],
    ["sort", "sort"],
  ])
    main
      .querySelector(`#queue-${name}`)
      ?.addEventListener(name === "search" ? "input" : "change", (event) => {
        filters[key] = event.target.value;
        main.querySelector("#queue-results").innerHTML = queueTable(
          queueJobs(workspace, filters),
        );
        bindClearFilters();
      });
  bindClearFilters();
  main.querySelector("#schedule-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    operation(
      {
        action: "schedule",
        jobId: currentJob().id,
        ...formInput(event.currentTarget),
        benchMinutes: event.currentTarget.elements.benchMinutes.value
          ? Number(event.currentTarget.elements.benchMinutes.value)
          : null,
        expectedReadyDate:
          event.currentTarget.elements.expectedReadyDate.value || null,
      },
      "Schedule and mechanic assignment saved.",
    );
  });
  main.querySelector("#note-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    operation(
      {
        action: "add-note",
        jobId: currentJob().id,
        ...formInput(event.currentTarget),
      },
      "Workshop note saved.",
    );
  });
  main.querySelector("#payment-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    operation(
      {
        action: "record-payment",
        jobId: currentJob().id,
        ...formInput(event.currentTarget),
      },
      "Offline payment recorded. No external charge was made.",
    );
  });
  main.querySelectorAll("[data-stock]").forEach((form) =>
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      operation(
        {
          action: "receive-stock",
          partId: form.dataset.stock,
          quantity: Number(new FormData(form).get("quantity")),
        },
        "Stock receipt saved.",
      );
    }),
  );
  main.querySelectorAll("[data-catalog]").forEach((form) =>
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      operation(
        {
          action: "catalog",
          serviceId: form.dataset.catalog,
          price: Number(data.get("price")),
          enabled: data.has("enabled"),
        },
        "Service updated. Existing estimates retain their original prices.",
      );
    }),
  );
  const estimateForm = main.querySelector("#estimate-form");
  if (estimateForm) {
    estimateForm
      .querySelectorAll('.part-picker input[type="checkbox"]')
      .forEach((checkbox) =>
        checkbox.addEventListener("change", () => {
          const row = checkbox.closest(".part-picker");
          row.classList.toggle("selected", checkbox.checked);
          row.querySelector(".part-specification").hidden = !checkbox.checked;
          row.querySelector(".part-quantity").hidden = !checkbox.checked;
        }),
      );
    estimateForm
      .querySelector('[name="itemized"]')
      ?.addEventListener("change", () => {
        const itemized = estimateForm.elements.itemized.checked;
        estimateForm.querySelector(".itemized-services").hidden = !itemized;
        for (const name of ["serviceCharge", "workDescription"]) {
          const field = estimateForm.elements[name];
          field.closest("label").hidden = itemized;
          field.disabled = itemized;
          field.required = !itemized;
        }
      });
    estimateForm
      .querySelectorAll("[data-service-picker]")
      .forEach((row) =>
        row
          .querySelector('input[type="checkbox"]')
          .addEventListener(
            "change",
            (event) =>
              (row.querySelector(".service-line-fields").hidden =
                !event.target.checked),
          ),
      );
  }
  estimateForm?.addEventListener("input", () => {
    const input = estimateInput(estimateForm);
    const job = currentJob();
    let total;
    try {
      total = sumMoney([
        input.serviceLines
          ? sumMoney(
              input.serviceLines.map((line) =>
                multiplyMoney(line.unitPrice, line.quantity),
              ),
            )
          : input.serviceCharge,
        job.collection ? 15 : 0,
        ...input.partLines.map((line) =>
          multiplyMoney(
            partsCatalogue(workspace).find((item) => item.id === line.id).price,
            line.quantity,
          ),
        ),
      ]);
    } catch {
      main.querySelector("#estimate-preview").textContent =
        "Complete the charges and quantities to preview the total.";
      return;
    }
    main.querySelector("#estimate-preview").textContent =
      `Revised total: ${money(total)}. Customer approval will be required.`;
  });
  estimateForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    repairAction("revise", estimateInput(estimateForm));
  });
  main.querySelector("#calendar-date")?.addEventListener("change", (event) => {
    if (event.target.value) {
      calendarStart = event.target.value;
      render();
    }
  });
  main.querySelectorAll("[data-calendar]").forEach((button) =>
    button.addEventListener("click", () => {
      calendarStart = new Date(
        Date.parse(calendarStart) + Number(button.dataset.calendar) * 86400000,
      )
        .toISOString()
        .slice(0, 10);
      render();
    }),
  );
}
function bindClearFilters() {
  main.querySelector("#clear-filters")?.addEventListener("click", () => {
    Object.assign(filters, {
      search: "",
      status: "all",
      priority: "all",
      sort: "due",
    });
    render();
  });
}
function openIntake(serviceId, recordBikeId) {
  if (busy || uncertain) return;
  newForm.reset();
  intakeReference = crypto.randomUUID();
  document.querySelector("#new-error").textContent = "";
  newForm.elements.bikeId.innerHTML = options(demoBikes, "city");
  newForm.elements.issueId.innerHTML = options(demoIssues, "brakes");
  if (!newForm.querySelector("#returning-intake")) {
    const field = document.createElement("label");
    field.id = "returning-intake";
    field.innerHTML =
      '<span>Saved bike (optional)</span><select name="recordBikeId" aria-label="Saved bike"><option value="">New bike / sample intake</option></select>';
    newForm.querySelector(".form-grid").before(field);
    const condition = document.createElement("label");
    condition.innerHTML =
      '<span>Intake condition (optional)</span><textarea name="condition" maxlength="600" placeholder="Visible damage, accessories left with the bike, or other intake observations"></textarea>';
    newForm.querySelector("#intake-includes").after(condition);
  }
  newForm.elements.recordBikeId.innerHTML =
    '<option value="">New bike / sample intake</option>' +
    options(
      workspace.bikes,
      recordBikeId,
      (item) =>
        `${workspace.customers.find((customer) => customer.id === item.customerId)?.name} · ${item.name}`,
    );
  newForm.querySelector(".form-grid").hidden = privateMode;
  newForm.elements.bikeId.closest("label").hidden = !!recordBikeId;
  newForm.querySelector("p.muted").textContent = privateMode
    ? "Enter the customer, bike and concern. The catalog supplies a starting service price. Inspect the bike before confirming work, compatible parts and collection."
    : "Choose a fictional bike and concern. The repair type supplies a starting price; actual work and parts are quoted after inspection.";
  if (privateMode && !newForm.querySelector("#custom-intake")) {
    const fields = document.createElement("div");
    fields.id = "custom-intake";
    fields.className = "stacked-form";
    fields.innerHTML =
      '<label>Customer name<input name="rider" maxlength="80" required autocomplete="off"></label><label>Bike / model<input name="bike" maxlength="80" required autocomplete="off"></label><label>Reported concern<textarea name="issue" maxlength="400" required></textarea></label>';
    newForm.querySelector(".form-grid").before(fields);
  }
  if (privateMode && recordBikeId) {
    const saved = workspace.bikes.find((item) => item.id === recordBikeId);
    newForm.elements.rider.value = workspace.customers.find(
      (item) => item.id === saved.customerId,
    ).name;
    newForm.elements.bike.value = saved.name;
  }
  if (privateMode)
    for (const key of ["rider", "bike"])
      newForm.elements[key].readOnly = !!recordBikeId;
  newForm.elements.serviceId.innerHTML = options(
    catalogue(workspace).filter((item) => item.enabled),
    serviceId || "safety",
    (item) => `${item.name} — from ${money(item.price)} · ${item.unit}`,
  );
  intakeEstimate();
  newDialog.showModal();
}
function intakeEstimate() {
  const service = catalogue(workspace).find(
    (item) => item.id === newForm.elements.serviceId.value,
  );
  document.querySelector("#intake-total").textContent = money(
    service.price + (newForm.elements.collection.checked ? 15 : 0),
  );
  document.querySelector("#intake-includes").innerHTML =
    `<ul class="included-list">${service.includes.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
}
newForm.addEventListener("change", (event) => {
  if (event.target.name === "recordBikeId") {
    newForm.elements.bikeId.closest("label").hidden = !!event.target.value;
    if (privateMode)
      for (const key of ["rider", "bike"])
        newForm.elements[key].readOnly = !!event.target.value;
  }
  if (
    privateMode &&
    event.target.name === "recordBikeId" &&
    event.target.value
  ) {
    const saved = workspace.bikes.find(
      (item) => item.id === event.target.value,
    );
    newForm.elements.rider.value = workspace.customers.find(
      (item) => item.id === saved.customerId,
    ).name;
    newForm.elements.bike.value = saved.name;
  }
  intakeEstimate();
});
newForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(newForm);
  operation(
    {
      action: "create",
      requestId: intakeReference,
      bikeId: data.get("bikeId"),
      issueId: data.get("issueId"),
      serviceId: data.get("serviceId"),
      collection: data.has("collection"),
      ...(data.get("recordBikeId")
        ? { recordBikeId: data.get("recordBikeId") }
        : {}),
      condition: data.get("condition"),
      ...(privateMode
        ? {
            rider: data.get("rider"),
            bike: data.get("bike"),
            issue: data.get("issue"),
          }
        : {}),
    },
    "Repair created. Start inspection, then prepare the estimate.",
  );
});
newDialog.addEventListener("cancel", (event) => {
  if (busy) event.preventDefault();
});
document.querySelectorAll("[data-close]").forEach((button) =>
  button.addEventListener("click", () => {
    if (!busy) newDialog.close();
  }),
);
confirmDialog.addEventListener("close", () => {
  if (confirmDialog.returnValue === "confirm")
    repairAction("cancel", { reasonId: "customer-request" });
});
document
  .querySelector("#new-repair")
  .addEventListener("click", () => openIntake());
document.querySelector("#reload").addEventListener("click", reload);
window.addEventListener("hashchange", () => {
  const [section, preset] = route();
  if (section === "queue" && preset) {
    filters.search = "";
    filters.priority = "all";
    filters.status = ["active", "approval", "ready", "waiting_parts"].includes(
      preset,
    )
      ? preset
      : "all";
  }
  render();
  main.focus({ preventScroll: true });
});
function download(name, type, content) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportData(format) {
  if (format === "json") {
    const { id, ...data } = workspace;
    download(
      `northline-workspace-${today()}.json`,
      "application/json",
      JSON.stringify(
        {
          format: "northline-workshop",
          version: 1,
          exportedAt: new Date().toISOString(),
          workspace: data,
        },
        null,
        2,
      ),
    );
  } else {
    const cell = (value) => {
      let text = String(value ?? "");
      if (/^[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const rows = [
      [
        "Reference",
        "Bike",
        "Rider",
        "Repair type",
        "Status",
        "Planned work date",
        "Expected collection date",
        "Bench budget minutes",
        "Mechanic",
        "Priority",
        "Estimate USD",
        "Payment USD",
      ],
      ...queueJobs(workspace, route()[0] === "queue" ? filters : {}).map(
        (job) => [
          job.id,
          job.bike,
          job.rider,
          typeFor(job).name,
          stateFor(job).label,
          job.dueDate || "",
          job.expectedReadyDate || "",
          job.benchMinutes ?? "",
          job.mechanic,
          job.priority || "routine",
          job.estimate,
          job.payment?.amount || "",
        ],
      ),
    ];
    download(
      `northline-repairs-${today()}.csv`,
      "text/csv;charset=utf-8",
      rows.map((row) => row.map(cell).join(",")).join("\r\n"),
    );
  }
  announce(
    "Your export is ready. Workspace exports omit the session identifier.",
  );
}
function printSummary() {
  const job = currentJob();
  const quote = quoteFor(job);
  document.querySelector(".print-document")?.remove();
  const page = document.createElement("section");
  page.className = "print-document";
  page.innerHTML = `<p>NORTHLINE CYCLE CO. / REPAIR SUMMARY</p><h1>${esc(job.bike)}</h1><p>${esc(job.id)} · ${esc(job.rider)} · ${esc(typeFor(job).name)}</p><p>${esc(job.issue)}</p><p>Status: ${esc(stateFor(job).label)} · Expected collection: ${job.expectedReadyDate ? esc(dateLabel(job.expectedReadyDate)) : "Not confirmed"} · Mechanic: ${esc(job.mechanic)}</p><h2>Estimate v${quote.version}</h2>${quoteLines(quote)}<p>Decision: ${esc(quote.decision)}${quote.decidedAt ? ` · ${esc(stamp(quote.decidedAt))}` : ""}</p><p>${job.payment ? `Payment recorded: ${money(job.payment.amount)} by ${esc(job.payment.method)}.` : "Payment has not been recorded."}</p><h2>Repair history</h2>${job.history
    .filter((entry) => !["schedule", "add-note"].includes(entry.action))
    .map((entry) => `<p>${esc(stamp(entry.at))} — ${esc(entry.note)}</p>`)
    .join(
      "",
    )}<p>${privateMode ? "Repair summary. Tax is not calculated. Payment entries record money received separately." : "Fictional portfolio workspace. This is a repair summary, not a tax invoice or evidence of a real charge."}</p>`;
  document.body.append(page);
  window.print();
}
function signIn() {
  main.innerHTML =
    heading(
      "PRIVATE WORKSHOP",
      "Your bench. Your workspace.",
      "Sign in with the operator key configured on this server.",
    ) +
    '<section class="panel login-panel"><form class="stacked-form" id="login-form"><label>Workshop key<input name="key" type="password" required minlength="16" maxlength="256" autocomplete="current-password"></label><p class="form-error" id="login-error" role="alert"></p><button class="primary-button" type="submit">Sign in</button></form></section>';
  document.querySelector("#new-repair").disabled = true;
  document.querySelector("#save-state").textContent = "Sign-in required";
  document
    .querySelector("#login-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector("button");
      button.disabled = true;
      try {
        await api("/api/session/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: new FormData(form).get("key") }),
        });
        form.reset();
        await boot();
      } catch (error) {
        form.querySelector("#login-error").textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
}
async function boot() {
  try {
    const access = await api("/api/access");
    privateMode = access.mode === "private";
    if (privateMode) {
      document.querySelector("#mode-label").textContent = "Private workshop";
      document.querySelector("#workspace-scope").textContent =
        "Private local workspace · Records remain until you clear them";
      if (!access.authenticated) {
        signIn();
        return;
      }
      await api("/api/tracker", { method: "POST" });
      if (!document.querySelector("#sign-out")) {
        const button = document.createElement("button");
        button.className = "quiet-button";
        button.id = "sign-out";
        button.textContent = "Sign out";
        document.querySelector(".app-topbar>div").prepend(button);
        button.addEventListener("click", async () => {
          if (busy) return;
          await api("/api/session/logout", { method: "POST" });
          workspace = undefined;
          button.remove();
          await boot();
        });
      }
    } else await ensureWorkspace();
    await reload();
  } catch (error) {
    main.innerHTML = empty(
      "Your workshop couldn't connect",
      "Try again to load or create your saved workspace.",
      '<button class="quiet-button" id="startup-retry">Try again</button>',
    );
    document
      .querySelector("#startup-retry")
      ?.addEventListener("click", () => location.reload());
    announce(error.message, true);
  }
}
document.querySelector("#workspace-date").textContent = new Intl.DateTimeFormat(
  undefined,
  { weekday: "long", month: "long", day: "numeric" },
).format(new Date());
await boot();
