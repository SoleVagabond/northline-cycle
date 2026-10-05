import { money, sumMoney } from "./lib/money.js";
import { demoBikes, demoIssues } from "./lib/repairs.js";
import { ensureWorkspace, apiData } from "./lib/demo-session.js";

const grid = document.querySelector("#service-grid");
const select = document.querySelector("#service");
const form = document.querySelector("#request-form");
const collection = document.querySelector("#collection");
const status = document.querySelector("#form-status");
const submit = form.querySelector('button[type="submit"]');
let activeFilter = "all";
let menu = [];
let pendingRequest;
let savedRepair;
const trackButton = document.querySelector("#track-created-repair");
const retryServices = document.querySelector("#retry-services");
let savingRequest = false;
let loadingServices = false;
for (const [id, values] of [
  ["bike", demoBikes],
  ["issue", demoIssues],
]) {
  const control = document.querySelector("#" + id);
  for (const item of values) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.label;
    control.append(option);
  }
}
trackButton.addEventListener("click", () => {
  window.dispatchEvent(
    new CustomEvent("northline:track-repair", { detail: savedRepair }),
  );
  document.querySelector("#tracker").scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  });
});

function setStatus(message, state) {
  status.textContent = message;
  status.dataset.state = state;
}
function updateEstimate() {
  const service = menu.find((item) => item.id === select.value);
  document.querySelector("#estimate-value").textContent = service
    ? money(sumMoney([service.price, collection.checked ? 15 : 0]))
    : "—";
  document.querySelector("#estimate-detail").textContent = service
    ? `${service.name}${collection.checked ? " + collection" : ""} · parts quoted separately`
    : "Choose a service to see an estimate";
}
function setRequestBusy(value) {
  savingRequest = value;
  form.setAttribute("aria-busy", String(value));
  for (const control of form.querySelectorAll("select, input"))
    control.disabled = value;
  for (const button of grid.querySelectorAll("button")) button.disabled = value;
  trackButton.disabled = value;
  retryServices.disabled = value || loadingServices;
  submit.disabled = value || loadingServices || menu.length === 0;
}
function renderServices() {
  grid.replaceChildren();
  const visible = menu.filter(
    (item) => activeFilter === "all" || item.category === activeFilter,
  );
  for (const item of visible) {
    const card = document.createElement("article");
    card.className = "service-card";
    const illustration = document.createElement("img");
    illustration.className = "service-illustration";
    illustration.src = "/assets/" + item.id + ".svg";
    illustration.alt = "";
    illustration.loading = "lazy";
    const top = document.createElement("div");
    top.className = "card-top";
    const number = document.createElement("span");
    number.className = "service-number";
    number.textContent = String(menu.indexOf(item) + 1).padStart(2, "0");
    const duration = document.createElement("span");
    duration.textContent = item.unit;
    top.append(number, duration);
    const heading = document.createElement("h3");
    heading.textContent = item.name;
    const description = document.createElement("p");
    description.textContent = item.description;
    const bottom = document.createElement("div");
    bottom.className = "card-bottom";
    const price = document.createElement("strong");
    price.textContent = `From ${money(item.price)}`;
    const choose = document.createElement("button");
    choose.type = "button";
    choose.className = "choose-service";
    choose.textContent = "Choose service ↗";
    choose.disabled = savingRequest;
    choose.setAttribute("aria-label", `Choose ${item.name}`);
    choose.addEventListener("click", () => {
      if (savingRequest) return;
      select.value = item.id;
      updateEstimate();
      document.querySelector("#request").scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
      select.focus({ preventScroll: true });
    });
    bottom.append(price, choose);
    card.append(illustration, top, heading, description, bottom);
    grid.append(card);
  }
  document.querySelector("#service-count").textContent =
    `${visible.length} services shown`;
}

for (const button of document.querySelectorAll("[data-filter]")) {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    for (const filter of document.querySelectorAll("[data-filter]"))
      filter.setAttribute("aria-pressed", String(filter === button));
    renderServices();
  });
}
select.addEventListener("change", updateEstimate);
collection.addEventListener("change", updateEstimate);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submit.disabled || !form.reportValidity()) return;
  setRequestBusy(true);
  setStatus("Creating your sample repair…", "pending");
  const choices = {
    serviceId: select.value,
    slot: form.elements.slot.value,
    bikeId: form.elements.bikeId.value,
    issueId: form.elements.issueId.value,
    collection: collection.checked,
  };
  const signature = JSON.stringify(choices);
  if (!pendingRequest || pendingRequest.signature !== signature)
    pendingRequest = { signature, requestId: crypto.randomUUID() };
  const payload = { ...choices, requestId: pendingRequest.requestId };
  try {
    await ensureWorkspace().catch(() => {});
    const response = await fetch("/api/enquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    const result = await apiData(
      response,
      "We could not confirm your saved request. Refresh before trying again.",
    );
    savedRepair = result;
    window.dispatchEvent(
      new CustomEvent("northline:repair-created", { detail: result }),
    );
    setStatus(
      `Sample repair ${result.repairId} saved. Estimate: ${money(result.estimate)}. Open its tracker to inspect, approve, and complete the repair. No appointment has been booked.`,
      "success",
    );
    trackButton.hidden = false;
    document.querySelector("#request-next-step").hidden = false;
    submit.textContent = "Create another sample repair ↗";
    pendingRequest = undefined;
    status.focus();
  } catch (error) {
    setStatus(
      `${error.name === "TimeoutError" ? "The response took too long; the repair may already be saved." : error.name === "TypeError" ? "The connection was interrupted; the repair may already be saved." : error.message} Your choices have been kept. Retry with the same choices to check without creating a duplicate.`,
      "error",
    );
    status.focus();
  } finally {
    setRequestBusy(false);
  }
});

async function loadServices() {
  if (loadingServices || savingRequest) return;
  loadingServices = true;
  submit.disabled = true;
  retryServices.disabled = true;
  const previousService = select.value;
  try {
    const response = await fetch("/api/services", {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Service menu unavailable");
    menu = (await response.json()).services;
    select.replaceChildren();
    for (const item of menu) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = `${item.name} — ${money(item.price)}`;
      select.append(option);
    }
    if (menu.some((item) => item.id === previousService))
      select.value = previousService;
    renderServices();
    updateEstimate();
    retryServices.hidden = true;
    if (status.dataset.state === "error")
      setStatus(
        "Service menu loaded. Your sample choices are ready.",
        "success",
      );
  } catch {
    grid.textContent =
      "The service menu could not load. Use Reload service menu in the repair form below to try again.";
    retryServices.hidden = false;
    setStatus(
      "The service menu is unavailable. Reload it to see prices and create a sample repair; your choices are kept.",
      "error",
    );
  } finally {
    loadingServices = false;
    retryServices.disabled = false;
    submit.disabled = savingRequest || menu.length === 0;
  }
}
retryServices.addEventListener("click", loadServices);
await loadServices();
