import { money } from "./lib/money.js";
import { stages, exceptionStages } from "./lib/repairs.js";
const main = document.querySelector("#customer-workspace");
const message = document.querySelector("#customer-message");
const secret = location.hash.slice(1);
let record,
  busy = false,
  requiresRefresh = false;
const imageUrls = [];
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const announce = (text, error = false) => {
  message.textContent = text;
  message.dataset.error = String(error);
};
async function request(path, input) {
  const response = await fetch(path, {
    method: input ? "POST" : "GET",
    headers: {
      authorization: "Bearer " + secret,
      ...(input ? { "Content-Type": "application/json" } : {}),
    },
    body: input ? JSON.stringify(input) : undefined,
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(data.error || "Your repair could not load."),
      { status: response.status },
    );
  return data;
}
function controls() {
  document.querySelector("#customer-refresh").disabled = busy;
  main
    .querySelectorAll("[data-decision]")
    .forEach((button) => (button.disabled = busy || requiresRefresh));
}
function lines(quote) {
  const services = quote.serviceLines || [
    {
      name: "Service charge",
      description: quote.workDescription || "Quoted service",
      price: quote.labour,
    },
  ];
  return `<table class="quote-lines"><caption class="sr-only">Itemized estimate</caption><tbody>${services.map((line) => `<tr><td>${esc(line.name)}<small>${esc(line.description)}${line.quantity ? ` · ${line.quantity} × ${money(line.unitPrice)}` : ""}</small></td><td>${money(line.price)}</td></tr>`).join("")}${quote.parts.map((part) => `<tr><td>${esc(part.name)}<small>${esc(part.specification || "")}${part.quantity ? ` · ${part.quantity} × ${money(part.unitPrice)}` : ""}</small></td><td>${money(part.price)}</td></tr>`).join("")}${quote.collection ? `<tr><td>Local collection</td><td>${money(quote.collection)}</td></tr>` : ""}<tr><td><strong>Total</strong></td><td><strong>${money(quote.total)}</strong></td></tr></tbody></table>`;
}
async function render() {
  imageUrls.splice(0).forEach(URL.revokeObjectURL);
  const job = record.job;
  const stage = [...stages, ...exceptionStages].find(
    (item) => item.id === job.status,
  );
  document.querySelector("#shop-name").textContent = record.shopName;
  main.innerHTML = `<div class="page-heading"><div><p class="eyebrow">YOUR REPAIR · ${esc(job.id)}</p><h1>${esc(job.bike)}</h1><p>${esc(job.issue)}</p></div><span class="status-pill ${esc(job.status)}">${esc(stage?.label || job.status)}</span></div><div class="portal-layout"><div class="detail-stack"><section class="panel"><h2>${esc(stage?.label || "Repair progress")}</h2><p>${esc(stage?.description || "The workshop will update your repair.")}</p><div class="detail-summary"><div><small>Expected collection</small><strong>${job.expectedReadyDate ? esc(new Date(job.expectedReadyDate + "T12:00:00Z").toLocaleDateString()) : "Not confirmed"}</strong></div><div><small>Estimate decision</small><strong>${esc(job.quote.decision)}</strong></div></div>${job.status === "waiting_parts" ? '<p class="quote-footnote">Your estimate remains approved. The workshop is waiting for the agreed parts and will confirm progress.</p>' : ""}${job.status === "approval" ? `<div class="next-action"><h3>Your decision</h3><p>Review every service and part below. Approving version ${job.quote.version} authorizes only this estimate.</p><div class="action-buttons"><button class="primary-button" data-decision="approve">Approve ${money(job.quote.total)} estimate</button><button class="quiet-button" data-decision="decline">Decline estimate</button></div></div>` : ""}</section><section class="panel"><h2>Workshop updates</h2>${
    job.updates.length
      ? job.updates
          .slice()
          .reverse()
          .map(
            (update) =>
              `<article class="customer-update"><small>${esc(new Date(update.at).toLocaleString())}</small><p>${esc(update.note)}</p></article>`,
          )
          .join("")
      : '<p class="muted">The workshop has not posted a customer update yet.</p>'
  }</section>${job.photos.length ? `<section class="panel"><h2>Photos from the workshop</h2><div class="photo-grid">${job.photos.map((photo) => `<figure><img data-photo="${esc(photo.id)}" alt="${esc(photo.caption)}"><figcaption>${esc(photo.caption)}</figcaption></figure>`).join("")}</div></section>` : ""}</div><section class="panel"><p class="eyebrow">ESTIMATE VERSION ${job.quote.version}</p><h2>Work & parts</h2><div class="quote-total">${money(job.quote.total)}</div>${lines(job.quote)}<p class="quote-footnote">${esc(job.quote.reason)}. USD; tax is not calculated. No payment is processed through this page.</p>${job.payment ? `<p>Workshop recorded ${money(job.payment.amount)} received by ${esc(job.payment.method)}.</p>` : ""}<details class="editor-section"><summary>Previous estimates & decisions</summary>${job.quotes.map((quote) => `<article class="estimate-version"><h3>Version ${quote.version} · ${money(quote.total)}</h3><p>${esc(quote.decision)}${quote.decidedAt ? " · " + esc(new Date(quote.decidedAt).toLocaleString()) : ""}</p>${lines(quote)}</article>`).join("")}</details></section></div>`;
  main
    .querySelectorAll("[data-decision]")
    .forEach((button) =>
      button.addEventListener("click", () => decide(button.dataset.decision)),
    );
  controls();
  const renderedRevision = record.revision;
  for (const image of main.querySelectorAll("[data-photo]")) {
    try {
      const response = await fetch(
        "/api/customer/photos/" + image.dataset.photo,
        {
          headers: { authorization: "Bearer " + secret },
          signal: AbortSignal.timeout(12000),
          cache: "no-store",
        },
      );
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      if (record.revision !== renderedRevision || !image.isConnected) {
        URL.revokeObjectURL(url);
        continue;
      }
      imageUrls.push(url);
      image.src = url;
    } catch {
      if (image.isConnected) {
        image.replaceWith(
          Object.assign(document.createElement("p"), {
            textContent: "Photo could not load. Refresh to try again.",
          }),
        );
      }
    }
  }
}
async function load() {
  if (busy) return;
  busy = true;
  controls();
  try {
    record = await request("/api/customer/repair");
    requiresRefresh = false;
    render();
    announce("Latest repair loaded.");
  } catch (error) {
    requiresRefresh = true;
    if (!record || error.status === 401) {
      record = undefined;
      main.innerHTML = `<section class="panel"><h1>Repair link unavailable</h1><p>${esc(error.message)}</p><p>Ask the workshop for a new link if this one was revoked or expired.</p></section>`;
    }
    announce(error.message, true);
  } finally {
    busy = false;
    controls();
  }
}
async function decide(action) {
  if (busy || requiresRefresh) return;
  busy = true;
  controls();
  try {
    record = await request("/api/customer/decision", {
      action,
      revision: record.revision,
      quoteVersion: record.job.quote.version,
    });
    render();
    announce(
      action === "approve"
        ? "Your estimate approval is saved."
        : "Your decision is saved. Work stays paused.",
    );
  } catch (error) {
    requiresRefresh = true;
    announce(
      error.status === 409
        ? "The estimate changed. Refresh and review it before deciding."
        : error.message ||
            "The connection was interrupted. Refresh to confirm your decision before trying again.",
      true,
    );
  } finally {
    busy = false;
    controls();
  }
}
document.querySelector("#customer-refresh").addEventListener("click", load);
window.addEventListener("pagehide", () =>
  imageUrls.splice(0).forEach(URL.revokeObjectURL),
);
window.addEventListener("hashchange", () => location.reload());
load();
