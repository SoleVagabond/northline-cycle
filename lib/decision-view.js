import {
  quoteFor,
  partOptions,
  labourOptions,
  quoteReasons,
  cancellationReasons,
} from "./quotes.js";
import { calculateEstimate } from "./services.js";

const options = (items, selected, escape) =>
  items
    .map(
      (item) =>
        `<option value="${item.id}" ${item.id === selected ? "selected" : ""}>${escape(item.name)}${"price" in item ? ` — ${item.price ? "+$" + item.price : "$0 extra"}` : ""}</option>`,
    )
    .join("");
export function decisionControls(job, role, disabled, escape, draft) {
  const quote = quoteFor(job);
  const draftTotal = draft
    ? (job.basePrice ?? calculateEstimate(job.serviceId, false)) +
      (job.collection ? 15 : 0) +
      partOptions.find((item) => item.id === draft.partsId).price +
      labourOptions.find((item) => item.id === draft.labourId).price
    : undefined;
  if (["collected", "cancelled"].includes(job.status)) return "";
  let html = "";
  if (role === "customer" && job.status === "approval")
    html += `<button class="decision-secondary" data-action="decline" ${disabled}>Decline this estimate</button><p class="action-note">Declining pauses work so the workshop can offer an alternative. It does not cancel the repair.</p>`;
  if (role === "workshop" && job.status === "repairing" && quote.parts.length)
    html += `<button class="decision-secondary" data-action="wait-parts" ${disabled}>Pause: waiting for parts</button>`;
  if (role === "workshop" && job.status === "waiting_parts")
    html += `<button class="button tracker-action" data-action="parts-arrived" ${disabled}>Parts arrived — resume repair</button>`;
  if (
    role === "workshop" &&
    ["inspection", "approval", "repairing", "declined"].includes(job.status)
  )
    html += `<details class="decision-editor" ${draft ? "open" : ""}><summary>Revise estimate</summary><form id="quote-form"><p>Choose fictional parts and labour. Saving immediately requests customer approval and pauses repair work.</p><label for="quote-parts">Replacement parts</label><select id="quote-parts" name="partsId" ${disabled}>${options(partOptions, draft?.partsId || quote.parts[0]?.id || "none", escape)}</select><label for="quote-labour">Labour scope</label><select id="quote-labour" name="labourId" ${disabled}>${options(labourOptions, draft?.labourId || quote.labourId || "standard", escape)}</select><label for="quote-reason">Why the estimate changed</label><select id="quote-reason" name="reasonId" ${disabled}>${options(quoteReasons, draft?.reasonId || (job.status === "declined" ? "alternative" : "inspection"), escape)}</select><p class="quote-preview" aria-live="polite">${draft ? `Revised total: $${draftTotal}. Customer approval will be required.` : `Current estimate: $${quote.total}. Choose changed parts or labour to request a new version.`}</p><button class="button" type="submit" ${disabled}>Send revised estimate for approval</button><p class="action-note">No charge is made and no message is sent outside this demo.</p></form></details>`;
  if (
    (role === "customer" &&
      ["received", "inspection", "approval", "declined"].includes(
        job.status,
      )) ||
    (role === "workshop" && job.status !== "ready")
  )
    html += `<details class="decision-editor cancellation-editor"><summary>Cancel repair</summary><form id="cancel-form"><p>Cancellation closes this sample repair permanently and keeps its journal. No payment or refund is processed.</p><label for="cancel-reason">Cancellation reason</label><select id="cancel-reason" name="reasonId" ${disabled}>${options(role === "customer" ? cancellationReasons.slice(0, 1) : cancellationReasons, "customer-request", escape)}</select><button class="decision-secondary" type="submit" ${disabled}>Confirm cancellation</button></form></details>`;
  return html;
}
export function quoteHistory(job, escape, time) {
  const quotes = job.quotes || [quoteFor(job)];
  const current = quotes.at(-1);
  return `<details class="quote-history"><summary>Estimate history · ${quotes.length} ${quotes.length === 1 ? "version" : "versions"}</summary><ol>${quotes
    .slice()
    .reverse()
    .map(
      (quote) =>
        `<li><strong>v${quote.version} · $${quote.total}${quote.version === current.version ? " · current" : ""}</strong><p>${escape(quote.reason)}</p><dl class="quote-breakdown"><div><dt>Labour</dt><dd>$${quote.labour}</dd></div>${quote.collection ? `<div><dt>Collection</dt><dd>$${quote.collection}</dd></div>` : ""}${quote.parts.map((part) => `<div><dt>${escape(part.name)}</dt><dd>$${part.price}</dd></div>`).join("")}</dl><p>${escape({ cancelled: "Cancelled before a customer decision", draft: "Not yet requested", pending: "Awaiting customer approval", approved: "Approved by customer", declined: "Declined by customer", superseded: "Superseded before a customer decision" }[quote.decision])}${quote.decidedAt ? ` · ${escape(time(quote.decidedAt))}` : ""}</p></li>`,
    )
    .join("")}</ol></details>`;
}
