import { money } from "./lib/money.js";
import { apiData } from "./lib/demo-session.js";
const form = document.querySelector("#customer-request-form");
const status = document.querySelector("#customer-request-status");
const select = form.elements.serviceId;
const submit = document.querySelector("#submit-customer-request");
const menu = document.querySelector("#customer-services");
const retry = document.querySelector("#retry-menu");
let services = [],
  busy = false,
  pending;
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const announce = (text, error = false) => {
  status.textContent = text;
  status.dataset.error = String(error);
};
function estimate() {
  const service = services.find((item) => item.id === select.value);
  document.querySelector("#starting-estimate").textContent = service
    ? `Starting estimate ${money(service.price + (form.elements.collection.checked ? 15 : 0))} · confirmed after inspection`
    : "Select a service to see its starting estimate.";
}
async function load() {
  menu.setAttribute("aria-busy", "true");
  retry.disabled = true;
  select.disabled = true;
  submit.disabled = true;
  try {
    const data = await apiData(
      await fetch("/api/public/services", {
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      }),
      "The service menu is unavailable. Try again shortly.",
    );
    services = data.services;
    menu.innerHTML = services
      .map(
        (service) =>
          `<article class="customer-service"><h3>${esc(service.name)}</h3><p>${esc(service.unit)}</p><div class="price"><small>From</small> ${money(service.price)}</div><p>${esc(service.description)}</p><ul>${service.includes.map((task) => `<li>${esc(task)}</li>`).join("")}</ul><button class="button button-small" data-service="${esc(service.id)}">Request ${esc(service.name)} ↗</button></article>`,
      )
      .join("");
    const selected = select.value;
    select.replaceChildren(
      new Option("Choose a service", ""),
      ...services.map(
        (service) =>
          new Option(
            `${service.name} — from ${money(service.price)}`,
            service.id,
          ),
      ),
    );
    if (services.some((service) => service.id === selected))
      select.value = selected;
    menu.querySelectorAll("[data-service]").forEach((button) =>
      button.addEventListener("click", () => {
        select.value = button.dataset.service;
        estimate();
        location.hash = "request";
        select.focus();
      }),
    );
    form.elements.email.placeholder = data.portfolio
      ? "rider@example.test"
      : "you@example.com";
    if (data.portfolio)
      document.querySelector("#public-mode-note").textContent =
        "Portfolio example: use fictional details and an optional example.test email. No real appointment is booked.";
    if (!data.portfolio) {
      document.querySelector("#public-mode-note").textContent =
        "The shop confirms scope, parts and collection after inspection. No appointment is reserved by this request.";
      document.querySelector("#phone-field").hidden = false;
      form.elements.phone.disabled = false;
    }
    retry.hidden = true;
    select.disabled = false;
    submit.disabled = false;
    estimate();
  } catch (error) {
    menu.textContent = error.message;
    retry.hidden = false;
  } finally {
    menu.setAttribute("aria-busy", "false");
    retry.disabled = false;
  }
}
select.addEventListener("change", estimate);
form.elements.collection.addEventListener("change", estimate);
retry.addEventListener("click", load);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !form.reportValidity()) return;
  const fields = new FormData(form),
    choices = {
      name: fields.get("name"),
      email: fields.get("email") || "",
      phone: fields.get("phone") || "",
      bike: fields.get("bike"),
      concern: fields.get("concern"),
      serviceId: select.value,
      collection: form.elements.collection.checked,
      website: fields.get("website") || "",
    };
  const signature = JSON.stringify(choices);
  if (!pending || pending.signature !== signature)
    pending = { signature, requestId: crypto.randomUUID() };
  busy = true;
  const locked = [
    ...form.querySelectorAll("input, select, textarea, button"),
    ...menu.querySelectorAll("button"),
  ].map((control) => [control, control.disabled]);
  locked.forEach(([control]) => (control.disabled = true));
  form.setAttribute("aria-busy", "true");
  announce("Saving your repair request…");
  try {
    const receipt = await apiData(
      await fetch("/api/public/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...choices, requestId: pending.requestId }),
        signal: AbortSignal.timeout(12000),
      }),
      "Your request could not be confirmed. Retry with the same choices.",
    );
    const panel = document.querySelector("#customer-receipt");
    panel.hidden = false;
    panel.innerHTML = `<h3>Request ${esc(receipt.repairId)} received</h3><p>Starting estimate ${money(receipt.estimate)}. The shop needs to inspect your bike before confirming the work or collection. No appointment has been reserved.</p><a class="button button-small" href="/customer.html#${esc(receipt.portalFragment)}">Open my repair →</a><p>Save your repair link. It is private to this repair; no email or message was sent.</p>`;
    announce("Your repair request is saved. Keep the link shown below.");
    pending = undefined;
    form.reset();
    estimate();
    panel.scrollIntoView({ block: "nearest" });
  } catch (error) {
    announce(
      `${error.message} Your choices have been kept. Retry with the same choices to check without creating a duplicate.`,
      true,
    );
  } finally {
    busy = false;
    locked.forEach(([control, disabled]) => (control.disabled = disabled));
    form.setAttribute("aria-busy", "false");
  }
});
document
  .querySelector("#open-repair-link")
  .addEventListener("submit", (event) => {
    event.preventDefault();
    const message = document.querySelector("#repair-link-status");
    try {
      const value = new FormData(event.currentTarget).get("link");
      const url = new URL(value);
      if (
        url.origin !== location.origin ||
        url.pathname !== "/customer.html" ||
        !/^#[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(url.hash)
      )
        throw Error("Paste the complete repair link supplied by Northline.");
      location.assign(url.href);
    } catch (error) {
      message.textContent = error.message || "Check your repair link.";
    }
  });
load();
