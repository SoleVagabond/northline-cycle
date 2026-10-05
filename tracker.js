import { stages, exceptionStages, workflowStage } from "./lib/repairs.js";
import { quoteFor, partOptions, labourOptions } from "./lib/quotes.js";
import { decisionControls, quoteHistory } from "./lib/decision-view.js";
import { services, calculateEstimate } from "./lib/services.js";
import { ensureWorkspace } from "./lib/demo-session.js";

const root = document.querySelector("#tracker-app");
const notice = document.querySelector("#tracker-status");
const roleButtons = [...document.querySelectorAll("[data-role]")];
let workspace;
let selected = "NL-2401";
let role = "customer";
let busy = false;
let uncertain = false;
let quoteDraft;
let filter = "all";
let operation = "Saving…";
const filterControl = document.querySelector("#repair-filter");
const refreshButton = document.querySelector("#refresh-tracker");
const retryButton = document.querySelector("#retry-tracker");
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const time = (value) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
const stageFor = (job) =>
  [...stages, ...exceptionStages].find((stage) => stage.id === job.status);
function announce(message, state = "") {
  notice.textContent = message;
  notice.dataset.state = state;
}

function render() {
  if (!workspace) return;
  document.querySelector("#reset-tracker").disabled = busy;
  retryButton.disabled = busy;
  refreshButton.disabled = busy;
  filterControl.disabled = busy;
  filterControl.value = filter;
  document.querySelector("#tracker-view-context").textContent =
    role === "customer"
      ? "Customer view · Review the estimate and approve when inspection is complete."
      : "Workshop view · Inspect, request approval, repair, and record collection.";
  const visibleJobs = workspace.jobs.filter(
    (item) => filter === "all" || item.status === filter,
  );
  const job =
    visibleJobs.find((item) => item.id === selected) || visibleJobs[0];
  const metrics = `<div class="tracker-metrics">${[
    ["all", "All repairs"],
    ["approval", "Awaiting approval"],
    ["ready", "Ready to collect"],
    ["collected", "Collected"],
  ]
    .map(
      ([value, label]) =>
        `<button type="button" data-repair-filter="${value}" aria-pressed="${filter === value}" ${busy ? "disabled" : ""}><strong>${workspace.jobs.filter((item) => value === "all" || item.status === value).length}</strong><span>${label}</span></button>`,
    )
    .join(
      "",
    )}<div class="saved-badge" data-state="${uncertain ? "uncertain" : "saved"}"><span class="status-dot"></span> ${busy ? operation : uncertain ? "Saved progress needs review" : "Progress saved"}</div></div>`;
  for (const button of roleButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.role === role));
    button.disabled = busy;
  }
  if (!job) {
    const emptyLabels = {
      ready: "repairs ready to collect",
      approval: "repairs awaiting approval",
      collected: "collected repairs",
      waiting_parts: "repairs waiting for parts",
      declined: "declined estimates",
      cancelled: "cancelled repairs",
    };
    root.innerHTML = `${metrics}<div class="repair-empty"><h3>No ${emptyLabels[filter] || "sample repairs"}</h3><p>Your other repairs are still saved. Choose All repairs to see them.</p><button class="button" type="button" data-repair-filter="all">Show all repairs</button></div>`;
    bindFilters();
    return;
  }
  selected = job.id;
  const current = stages.findIndex((stage) => stage.id === workflowStage(job));
  const quote = quoteFor(job);
  const disabled = busy || uncertain ? "disabled" : "";
  const nextOwner =
    job.status === "cancelled"
      ? "CLOSED"
      : ["collected"].includes(job.status)
        ? "COMPLETE"
        : ["approval", "ready"].includes(job.status)
          ? "NEXT: CUSTOMER"
          : "NEXT: WORKSHOP";
  let action = "";
  if (role === "customer" && job.status === "approval")
    action = `<button class="button tracker-action" data-action="approve" ${disabled}>Approve $${job.estimate} estimate <span aria-hidden="true">↗</span></button><p class="action-note">Demo approval only. No charge is made. Approval starts the agreed work.</p>`;
  else if (
    role === "workshop" &&
    ["received", "inspection", "repairing", "quality", "ready"].includes(
      job.status,
    )
  )
    action = `<button class="button tracker-action" data-action="advance" ${disabled}>${escape({ received: "Start inspection", inspection: "Request customer approval", repairing: "Move to ride check", quality: "Mark ready to collect", ready: "Mark collected" }[job.status])}<span aria-hidden="true">↗</span></button><p class="action-note">${job.status === "inspection" ? "Send the estimate to Customer view. Repair work stays blocked until approval." : job.status === "ready" ? "Record collection after the rider has received the bike. This saves the final stage." : "Updates this sample repair and saves its progress."}</p>`;
  else
    action = `<p class="action-note">${escape(job.status === "approval" ? "Waiting for the rider’s approval. Review the estimate in Customer view." : job.status === "cancelled" ? "This repair is closed. Its saved history remains available." : job.status === "declined" ? "The customer declined this estimate. The workshop can offer an alternative or cancel the repair." : job.status === "waiting_parts" ? "The approved repair is paused until the replacement parts arrive." : job.status === "collected" ? "All done. This bike is back on the road. Its saved journal stays available." : job.status === "ready" ? "Ready to collect. The workshop records collection after the handover." : ["received", "inspection"].includes(job.status) ? "The workshop must inspect this bike before asking for your approval." : "The agreed work is with the workshop. Follow its progress here.")}</p>`;
  if (
    !["collected", "cancelled"].includes(job.status) &&
    !(role === "customer" && job.status === "approval") &&
    !(role === "workshop" && job.status !== "approval")
  )
    action += `<button class="view-handoff" type="button" data-view="${role === "workshop" ? "customer" : "workshop"}" ${busy ? "disabled" : ""}>Continue in ${role === "workshop" ? "Customer" : "Workshop"} view →</button>`;
  const draft =
    quoteDraft?.jobId === job.id && quoteDraft.version === quote.version
      ? quoteDraft.choices
      : undefined;
  action += decisionControls(job, role, disabled, escape, draft);
  const approval =
    job.status === "cancelled"
      ? "Repair closed"
      : quote.decision === "declined"
        ? "Customer declined this estimate"
        : quote.decision === "approved"
          ? "✓ Estimate approved"
          : job.status === "approval"
            ? "Customer approval needed"
            : "Approval follows inspection";
  root.innerHTML = `${metrics}
  <div class="tracker-layout"><aside class="repair-list" aria-label="Sample repairs">${visibleJobs.map((item) => `<button class="repair-choice ${item.id === selected ? "selected" : ""}" data-job="${escape(item.id)}" aria-pressed="${item.id === selected}" ${busy ? "disabled" : ""}><span class="repair-reference">${escape(item.id)}</span><strong>${escape(item.bike)}</strong><span>${escape(item.rider)} · ${escape(stageFor(item).label)}</span></button>`).join("")}<p class="repair-list-note">Fictional repairs.<br>Your changes stay in your demo.</p></aside>
  <article class="repair-detail" aria-labelledby="repair-title"><div class="repair-detail-heading"><div><p class="eyebrow">${escape(job.id)} / ${role === "customer" ? "CUSTOMER VIEW" : "WORKSHOP VIEW"}</p><h3 id="repair-title" tabindex="-1">${escape(job.bike)}</h3><p>${escape(job.issue)}</p></div><span class="stage-badge">${escape(stageFor(job).label)}</span></div>
  <ol class="repair-timeline" aria-label="Repair stages">${stages.map((stage, index) => `<li class="${index < current ? "complete" : index === current ? "current" : ""}" ${index === current && job.status !== "cancelled" ? 'aria-current="step"' : ""}><span class="step-dot" aria-hidden="true">${index < current ? "✓" : String(index + 1).padStart(2, "0")}</span><span>${escape(stage.label)}</span><span class="sr-only">${index < current ? "Complete" : index === current ? (job.status === "cancelled" ? "Stopped here" : "Current stage") : "Upcoming"}</span></li>`).join("")}</ol>
  <div class="repair-info"><div class="repair-now"><span class="small-label">${nextOwner}</span><h4>${escape(stageFor(job).label)}</h4><p>${escape(stageFor(job).description)}</p><div class="tracker-actions">${action}</div>${uncertain ? '<p class="repair-warning">This update may already be saved. Use Reload saved progress before another repair action.</p>' : ""}</div><div class="repair-quote"><span class="small-label">ESTIMATED TOTAL</span><strong>$${job.estimate}</strong><p>${escape(services.find((item) => item.id === job.serviceId).name)}${job.collection ? " + collection" : ""}</p><dl class="quote-breakdown"><div><dt>Labour</dt><dd>$${quote.labour}</dd></div>${job.collection ? "<div><dt>Local collection</dt><dd>$15</dd></div>" : ""}${quote.parts.map((part) => `<div><dt>${escape(part.name)}</dt><dd>$${part.price}</dd></div>`).join("")}</dl><span class="approval-label">${approval}</span><small>${escape(quote.parts.length ? "Parts are included in this estimate; all prices are fictional." : job.parts)}</small><p class="quote-version">Estimate v${quote.version} · ${escape(quote.reason)}</p></div></div>
  ${quoteHistory(job, escape, time)}<details class="repair-history" open><summary>Repair journal <span>${job.history.length} updates</span></summary><ol>${job.history
    .slice()
    .reverse()
    .map(
      (entry) =>
        `<li><time datetime="${escape(entry.at)}">${escape(time(entry.at))}</time><p>${escape(entry.note)}</p></li>`,
    )
    .join(
      "",
    )}</ol></details><div class="repair-detail-footer"><span>Looked after by ${escape(job.mechanic)}</span><span>Last update ${escape(time(job.updatedAt))}</span></div></article></div>`;
  for (const button of root.querySelectorAll("[data-job]"))
    button.addEventListener("click", () => {
      selected = button.dataset.job;
      announce("");
      render();
      root
        .querySelector(`[data-job="${selected}"]`)
        .focus({ preventScroll: true });
    });
  for (const button of root.querySelectorAll("[data-action]"))
    button.addEventListener("click", (event) =>
      changeRepair(event.currentTarget.dataset.action),
    );
  const quoteForm = root.querySelector("#quote-form");
  quoteForm?.addEventListener("change", () => {
    const part = partOptions.find(
      (item) => item.id === quoteForm.elements.partsId.value,
    );
    const labour = labourOptions.find(
      (item) => item.id === quoteForm.elements.labourId.value,
    );
    const total =
      calculateEstimate(job.serviceId, job.collection) +
      part.price +
      labour.price;
    quoteForm.querySelector(".quote-preview").textContent =
      `Revised total: $${total} (${total === quote.total ? "same total" : `${total > quote.total ? "+" : "−"}$${Math.abs(total - quote.total)}`}). Customer approval will be required.`;
  });
  quoteForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const choices = Object.fromEntries(new FormData(quoteForm));
    quoteDraft = { jobId: job.id, version: quote.version, choices };
    changeRepair("revise", choices);
  });
  root.querySelector("#cancel-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (
      window.confirm(
        "Cancel this sample repair permanently? Its saved journal will remain available.",
      )
    )
      changeRepair(
        "cancel",
        Object.fromEntries(new FormData(event.currentTarget)),
      );
  });
  root.querySelector("[data-view]")?.addEventListener("click", (event) => {
    role = event.currentTarget.dataset.view;
    announce(
      `${role === "customer" ? "Customer" : "Workshop"} view selected. Repair progress has not changed.`,
    );
    render();
    root.querySelector("#repair-title")?.focus({ preventScroll: true });
  });
  bindFilters();
}

function bindFilters() {
  for (const button of root.querySelectorAll("[data-repair-filter]"))
    button.addEventListener("click", () => {
      filter = button.dataset.repairFilter;
      render();
      filterControl.focus({ preventScroll: true });
    });
}
filterControl.addEventListener("change", () => {
  filter = filterControl.value;
  render();
});

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(data.error || "The tracker is unavailable."),
      { status: response.status },
    );
  return data;
}
async function changeRepair(action, choices = {}) {
  if (busy || uncertain) return;
  busy = true;
  operation = "Saving…";
  render();
  announce("Saving your repair update…");
  try {
    const data = await request("/api/tracker/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: selected,
        role,
        action,
        quoteVersion: quoteFor(
          workspace.jobs.find((job) => job.id === selected),
        ).version,
        ...choices,
        revision: workspace.revision,
      }),
    });
    workspace = data.workspace;
    quoteDraft = undefined;
    uncertain = false;
    announce("Repair progress saved.", "success");
  } catch (error) {
    uncertain = ![422, 403].includes(error.status);
    retryButton.hidden = !uncertain;
    if (error.status === 409) {
      try {
        workspace = (await request("/api/tracker")).workspace;
        uncertain = false;
        retryButton.hidden = true;
        announce(
          "This repair changed in another view. Its latest saved progress is now shown. Review it before trying again.",
          "error",
        );
      } catch {
        announce(
          "This repair changed, but the latest progress could not load. Reload saved progress before trying again.",
          "error",
        );
      }
    } else
      announce(
        error.status
          ? error.message
          : "The connection was interrupted. This update may already be saved. Reload saved progress to check before trying again.",
        "error",
      );
  } finally {
    busy = false;
    render();
    notice.tabIndex = -1;
    notice.focus({ preventScroll: true });
  }
}
for (const button of roleButtons)
  button.addEventListener("click", () => {
    role = button.dataset.role;
    announce("");
    render();
  });
document.querySelector("#reset-tracker").addEventListener("click", async () => {
  if (
    busy ||
    !window.confirm(
      "Start a fresh demo with the original three sample repairs?",
    )
  )
    return;
  busy = true;
  operation = "Resetting…";
  render();
  try {
    workspace = (await request("/api/tracker/reset", { method: "POST" }))
      .workspace;
    selected = "NL-2401";
    filter = "all";
    uncertain = false;
    announce("Fresh sample repairs loaded.", "success");
  } catch {
    uncertain = true;
    retryButton.hidden = false;
    announce(
      "The reset could not be confirmed. Reload saved progress to check whether it completed.",
      "error",
    );
  } finally {
    busy = false;
    render();
  }
});
async function reloadLatest() {
  if (busy) return;
  busy = true;
  operation = "Loading…";
  render();
  announce("Loading saved progress…");
  try {
    workspace = (await request("/api/tracker", { method: "POST" })).workspace;
    uncertain = false;
    retryButton.hidden = true;
    announce("Latest saved progress loaded.", "success");
    return true;
  } catch {
    uncertain = true;
    announce(
      "Saved progress could not load. Check your connection and retry.",
      "error",
    );
    retryButton.hidden = false;
    return false;
  } finally {
    busy = false;
    render();
    notice.tabIndex = -1;
    notice.focus({ preventScroll: true });
  }
}
retryButton.addEventListener("click", reloadLatest);
refreshButton.addEventListener("click", reloadLatest);
window.addEventListener("northline:repair-created", (event) => {
  workspace = event.detail.workspace;
  selected = event.detail.repairId;
  filter = "all";
  uncertain = false;
  render();
});
window.addEventListener("northline:track-repair", async (event) => {
  selected = event.detail.repairId;
  filter = "all";
  role = "workshop";
  if (await reloadLatest()) {
    render();
    announce(
      workspace.jobs.some((job) => job.id === event.detail.repairId)
        ? "Your sample repair is open. Inspect it in Workshop view, request approval, then switch to Customer view to approve."
        : "That repair has expired or was reset. The current sample repairs are shown.",
      "success",
    );
  }
});
try {
  workspace = (await ensureWorkspace()).workspace;
  selected = workspace.jobs[0].id;
  render();
} catch {
  root.textContent = "The repair tracker could not load.";
  retryButton.hidden = false;
  announce("Use Reload saved progress to try again.", "error");
}
