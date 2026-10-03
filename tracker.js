import { stages } from "./lib/repairs.js";
import { services } from "./lib/services.js";
import { ensureWorkspace } from "./lib/demo-session.js";

const root = document.querySelector("#tracker-app");
const notice = document.querySelector("#tracker-status");
const roleButtons = [...document.querySelectorAll("[data-role]")];
let workspace;
let selected = "NL-2401";
let role = "customer";
let busy = false;
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
const stageFor = (job) => stages.find((stage) => stage.id === job.status);
function announce(message, state = "") {
  notice.textContent = message;
  notice.dataset.state = state;
}

function render() {
  if (!workspace) return;
  document.querySelector("#reset-tracker").disabled = busy;
  retryButton.disabled = busy;
  const job =
    workspace.jobs.find((item) => item.id === selected) || workspace.jobs[0];
  selected = job.id;
  const current = stages.findIndex((stage) => stage.id === job.status);
  const ready = workspace.jobs.filter((item) =>
    ["ready", "collected"].includes(item.status),
  ).length;
  for (const button of roleButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.role === role));
    button.disabled = busy;
  }
  let action = "";
  if (role === "customer" && job.status === "approval")
    action = `<button class="button tracker-action" data-action="approve" ${busy ? "disabled" : ""}>Approve $${job.estimate} estimate <span aria-hidden="true">↗</span></button><p class="action-note">Demo approval only. No charge is made.</p>`;
  else if (
    role === "workshop" &&
    !["approval", "collected"].includes(job.status)
  )
    action = `<button class="button tracker-action" data-action="advance" ${busy ? "disabled" : ""}>${escape({ received: "Start inspection", inspection: "Request customer approval", repairing: "Move to ride check", quality: "Mark ready to collect", ready: "Mark collected" }[job.status])}<span aria-hidden="true">↗</span></button><p class="action-note">Updates this sample repair and saves its progress.</p>`;
  else
    action = `<p class="action-note">${escape(job.status === "approval" ? "Waiting for the rider’s approval. Switch to Customer view to approve the estimate." : job.status === "collected" ? "All done. This bike is back on the road." : job.status === "ready" ? "Ready to collect. The workshop view can mark this sample as collected." : "Your repair is moving along. Try Workshop view to update its progress.")}</p>`;
  root.innerHTML = `<div class="tracker-metrics"><div><strong>${workspace.jobs.length}</strong><span>sample repairs</span></div><div><strong>${workspace.jobs.length - ready}</strong><span>in the workshop</span></div><div><strong>${ready}</strong><span>ready or collected</span></div><div class="saved-badge"><span class="status-dot"></span> ${busy ? "Saving…" : "Progress saved"}</div></div>
  <div class="tracker-layout"><aside class="repair-list" aria-label="Sample repairs">${workspace.jobs.map((item) => `<button class="repair-choice ${item.id === selected ? "selected" : ""}" data-job="${escape(item.id)}" aria-pressed="${item.id === selected}" ${busy ? "disabled" : ""}><span class="repair-reference">${escape(item.id)}</span><strong>${escape(item.bike)}</strong><span>${escape(item.rider)} · ${escape(stageFor(item).label)}</span></button>`).join("")}<p class="repair-list-note">Fictional repairs.<br>Your changes stay in your demo.</p></aside>
  <article class="repair-detail" aria-labelledby="repair-title"><div class="repair-detail-heading"><div><p class="eyebrow">${escape(job.id)} / ${role === "customer" ? "YOUR REPAIR" : "WORKSHOP DEMO"}</p><h3 id="repair-title">${escape(job.bike)}</h3><p>${escape(job.issue)}</p></div><span class="stage-badge">${escape(stageFor(job).label)}</span></div>
  <ol class="repair-timeline" aria-label="Repair stages">${stages.map((stage, index) => `<li class="${index < current ? "complete" : index === current ? "current" : ""}" ${index === current ? 'aria-current="step"' : ""}><span class="step-dot" aria-hidden="true">${index < current ? "✓" : String(index + 1).padStart(2, "0")}</span><span>${escape(stage.label)}</span><span class="sr-only">${index < current ? "Complete" : index === current ? "Current stage" : "Upcoming"}</span></li>`).join("")}</ol>
  <div class="repair-info"><div class="repair-now"><span class="small-label">RIGHT NOW</span><h4>${escape(stageFor(job).label)}</h4><p>${escape(stageFor(job).description)}</p><div class="tracker-actions">${action}</div></div><div class="repair-quote"><span class="small-label">LABOUR ESTIMATE</span><strong>$${job.estimate}</strong><p>${escape(services.find((item) => item.id === job.serviceId).name)}${job.collection ? " + collection" : ""}</p><span class="approval-label">${job.approved ? "✓ Estimate approved" : "Approval pending"}</span><small>${escape(job.parts)}</small></div></div>
  <details class="repair-history" open><summary>Repair journal <span>${job.history.length} updates</span></summary><ol>${job.history
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
  root
    .querySelector("[data-action]")
    ?.addEventListener("click", (event) =>
      changeRepair(event.currentTarget.dataset.action),
    );
}

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
async function changeRepair(action) {
  if (busy) return;
  busy = true;
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
        revision: workspace.revision,
      }),
    });
    workspace = data.workspace;
    announce("Repair progress saved.", "success");
  } catch (error) {
    retryButton.hidden = false;
    if (error.status === 409) {
      try {
        workspace = (await request("/api/tracker")).workspace;
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
  render();
  try {
    workspace = (await request("/api/tracker/reset", { method: "POST" }))
      .workspace;
    selected = "NL-2401";
    announce("Fresh sample repairs loaded.", "success");
  } catch {
    announce(
      "The demo could not reset. Your previous progress is still available.",
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
  render();
  announce("Loading saved progress…");
  try {
    workspace = (await request("/api/tracker", { method: "POST" })).workspace;
    retryButton.hidden = true;
    announce("Latest saved progress loaded.", "success");
    return true;
  } catch {
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
window.addEventListener("northline:repair-created", (event) => {
  workspace = event.detail.workspace;
  selected = event.detail.repairId;
  render();
});
window.addEventListener("northline:track-repair", async (event) => {
  selected = event.detail.repairId;
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
