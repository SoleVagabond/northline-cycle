import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const target = new URL(process.argv[2] || "http://127.0.0.1:8788");
const local =
  ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) &&
  target.protocol === "http:";
if (
  !local &&
  !(
    process.argv.includes("--hosted") &&
    target.origin === "https://northline-cycle-devin.netlify.app"
  )
)
  throw new Error(
    "Use loopback or the owned Northline deployment with --hosted.",
  );
let workspace,
  cookie,
  passed = 0;
async function call(path, input, token) {
  const response = await fetch(target.origin + path, {
    method: input ? "POST" : "GET",
    headers: {
      ...(cookie && !token ? { cookie } : {}),
      ...(input ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: "Bearer " + token } : {}),
    },
    body: input ? JSON.stringify(input) : undefined,
  });
  assert.ok(
    response.ok,
    `${path}: HTTP ${response.status} ${await response.clone().text()}`,
  );
  return response;
}
async function operation(input) {
  const data = await (
    await call("/api/workshop/actions", {
      ...input,
      revision: workspace.revision,
    })
  ).json();
  workspace = data.workspace;
  return data;
}
async function repair(action, extra = {}) {
  workspace = (
    await (
      await call("/api/tracker/actions", {
        revision: workspace.revision,
        jobId: workspace.jobs[0].id,
        role: "workshop",
        action,
        ...extra,
      })
    ).json()
  ).workspace;
}
const check = async (name, run) => {
  await run();
  passed++;
  console.log("PASS " + name);
};
await check(
  "Migrated records are readable in a fresh isolated workspace",
  async () => {
    const response = await fetch(target.origin + "/api/tracker", {
      method: "POST",
    });
    assert.equal(response.status, 201);
    cookie = response.headers.get("set-cookie").split(";")[0];
    workspace = (await response.json()).workspace;
    workspace = (await (await call("/api/workshop")).json()).workspace;
    assert.equal(workspace.customers.length, 3);
    assert.equal(workspace.bikes.length, 3);
  },
);
let recordBikeId, partId;
await check(
  "Customer and bike records link a returning repair without replacing earlier records",
  async () => {
    const customer = await operation({
      action: "save-customer",
      name: "Fictional QA rider",
      email: "rider@northline.test",
      phone: "",
    });
    const bike = await operation({
      action: "save-bike",
      customerId: customer.customerId,
      name: "Fictional QA gravel bike",
      serial: "QA-FICTIONAL-501",
      notes: "Integration fixture",
    });
    recordBikeId = bike.recordBikeId;
    await operation({
      action: "create",
      requestId: randomUUID(),
      recordBikeId,
      bikeId: "city",
      issueId: "brakes",
      serviceId: "brake",
      collection: false,
      condition: "Fictional scratched grip",
    });
    assert.equal(workspace.jobs[0].recordBikeId, recordBikeId);
    assert.equal(workspace.jobs.length, 4);
  },
);
await check(
  "A configurable compatible SKU starts empty and retains a fractional price",
  async () => {
    await operation({
      action: "save-part",
      name: "QA compatible tube",
      sku: "QA-TUBE-700",
      specification: "700C 28-32mm, Presta",
      price: 8.95,
      reorderAt: 2,
      enabled: true,
    });
    partId = workspace.customParts.at(-1).id;
    assert.equal(
      workspace.inventory.find((item) => item.id === partId).onHand,
      0,
    );
  },
);
await check(
  "An itemized two-service estimate has an exact server total",
  async () => {
    await repair("advance");
    await repair("revise", {
      reasonId: "inspection",
      serviceLines: [
        {
          id: "brake",
          quantity: 2,
          unitPrice: 40.25,
          description: "Inspect and adjust both mechanical brakes",
        },
        {
          id: "wheel",
          quantity: 1,
          unitPrice: 35.1,
          description: "True rear wheel after inspection",
        },
      ],
      partLines: [
        {
          id: partId,
          quantity: 3,
          specification: "700C 28-32mm, Presta; wheels inspected",
        },
      ],
    });
    assert.equal(workspace.jobs[0].estimate, 142.45);
    assert.equal(workspace.jobs[0].quotes.at(-1).serviceLines.length, 2);
  },
);
await check(
  "Internal findings and private photos stay outside a scoped customer link",
  async () => {
    await operation({
      action: "add-note",
      jobId: workspace.jobs[0].id,
      note: "PRIVATE-QA-NOTE",
    });
    await operation({
      action: "customer-update",
      jobId: workspace.jobs[0].id,
      note: "Your inspected work is ready for approval.",
    });
    const data =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGP4/x8AAwAB//wl3FEAAAAASUVORK5CYII=";
    for (const visible of [false, true])
      workspace = (
        await (
          await call("/api/photos", {
            revision: workspace.revision,
            jobId: workspace.jobs[0].id,
            data,
            caption: visible ? "Shared QA wear photo" : "Private QA intake",
            customerVisible: visible,
          })
        ).json()
      ).workspace;
  },
);
let token;
await check(
  "The recipient approves the current estimate and stock shortage pauses work",
  async () => {
    token = (
      await operation({ action: "create-link", jobId: workspace.jobs[0].id })
    ).portalFragment;
    const view = await (
      await call("/api/customer/repair", undefined, token)
    ).json();
    assert.equal(view.job.photos.length, 1);
    assert.doesNotMatch(
      JSON.stringify(view),
      /PRIVATE-QA-NOTE|Private QA intake|NL-2401|customerAccess/,
    );
    const photo = await call(
      "/api/customer/photos/" + view.job.photos[0].id,
      undefined,
      token,
    );
    assert.equal(photo.headers.get("content-type"), "image/png");
    assert.equal((await photo.arrayBuffer()).byteLength, 68);
    const result = await (
      await call(
        "/api/customer/decision",
        { action: "approve", revision: view.revision, quoteVersion: 2 },
        token,
      )
    ).json();
    assert.equal(result.job.status, "waiting_parts");
    workspace = (await (await call("/api/workshop")).json()).workspace;
  },
);
await check(
  "Stock receipt, consumption, checks, payment and collection complete the itemized repair",
  async () => {
    await operation({ action: "receive-stock", partId, quantity: 3 });
    await repair("parts-arrived");
    await repair("advance");
    for (const checkId of ["brakes", "gears", "wheels", "fasteners"])
      await operation({
        action: "check",
        jobId: workspace.jobs[0].id,
        checkId,
        passed: true,
      });
    await repair("advance");
    await operation({
      action: "record-payment",
      jobId: workspace.jobs[0].id,
      method: "cash",
    });
    await repair("advance");
    assert.equal(workspace.jobs[0].status, "collected");
    assert.equal(workspace.jobs[0].payment.amount, 142.45);
    assert.equal(
      workspace.inventory.find((item) => item.id === partId).onHand,
      0,
    );
  },
);
await check(
  "Revocation denies the previously working customer link",
  async () => {
    await operation({ action: "revoke-link", jobId: workspace.jobs[0].id });
    const response = await fetch(target.origin + "/api/customer/repair", {
      headers: { authorization: "Bearer " + token },
    });
    assert.equal(response.status, 401);
  },
);
console.log(
  `${passed} work-order integration checks passed against ${target.origin}. Separate fictional workspace; no customer messages or charges.`,
);
