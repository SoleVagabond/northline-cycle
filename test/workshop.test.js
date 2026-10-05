import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createWorkspace } from "../lib/repairs.js";
import { quoteFor } from "../lib/quotes.js";
import { qualityChecks, workshopDate } from "../lib/services.js";
import {
  workshopAction,
  repairAction,
  operationsWorkspace,
  stockSummary,
} from "../lib/workshop-domain.js";
import {
  queueJobs,
  workshopReport,
  plannedMinutes,
} from "../lib/workshop-query.js";
import { createApi } from "../lib/api.js";
const now = new Date("2026-10-05T12:00:00Z");
const seed = () => operationsWorkspace(createWorkspace(randomUUID(), now));
const create = (workspace, serviceId = "brake", extras = {}) =>
  workshopAction(
    workspace,
    {
      action: "create",
      requestId: randomUUID(),
      bikeId: "city",
      issueId: "brakes",
      collection: false,
      serviceId,
      ...extras,
    },
    now,
  );
const act = (workspace, action, role = "workshop", extras = {}) =>
  repairAction(
    workspace,
    {
      jobId: "NL-2401",
      action,
      role,
      quoteVersion: quoteFor(workspace.jobs.find((job) => job.id === "NL-2401"))
        .version,
      ...extras,
    },
    now,
  );
const job = (workspace) => workspace.jobs.find((item) => item.id === "NL-2401");
const revise = (workspace, quantity = 2) =>
  act(workspace, "revise", "workshop", {
    partLines: [
      { id: "pads", quantity },
      { id: "tube", quantity: 1 },
    ],
    labourId: "standard",
    reasonId: "inspection",
  });

test("scheduling uses the workshop business day across UTC midnight and daylight saving", () => {
  const midnight = new Date("2026-10-05T00:30:00Z");
  assert.equal(workshopDate(midnight), "2026-10-04");
  assert.equal(workshopDate(new Date("2026-11-02T04:30:00Z")), "2026-11-01");
  const original = operationsWorkspace(createWorkspace(randomUUID(), midnight));
  const updated = workshopAction(
    original,
    {
      action: "schedule",
      jobId: "NL-2401",
      dueDate: "2026-10-04",
      mechanicId: "alex",
      priority: "high",
    },
    midnight,
  );
  assert.equal(job(updated.workspace).dueDate, "2026-10-04");
});

test("a catalog cannot disable the last available repair type", () => {
  let workspace = seed();
  for (const service of [
    "safety",
    "puncture",
    "tune",
    "overhaul",
    "drivetrain",
    "wheel",
    "brake",
    "chain-fit",
    "cable",
    "bearing",
    "hydraulic",
  ])
    workspace = workshopAction(
      workspace,
      { action: "catalog", serviceId: service, price: 25, enabled: false },
      now,
    ).workspace;
  assert.throws(
    () =>
      workshopAction(
        workspace,
        { action: "catalog", serviceId: "ebike", price: 50, enabled: false },
        now,
      ),
    /at least one/,
  );
});

test("a revised labour scope cannot silently overbook the assigned mechanic", () => {
  let workspace = seed();
  workspace.jobs = [job(workspace)];
  workspace.jobs[0].serviceId = "overhaul";
  const other = structuredClone(workspace.jobs[0]);
  other.id = "CAPACITY-SECOND";
  workspace.jobs.push(other);
  assert.throws(
    () =>
      act(workspace, "revise", "workshop", {
        partLines: [],
        labourId: "extended",
        reasonId: "inspection",
      }),
    /eight hours/,
  );
  assert.equal(quoteFor(job(workspace)).version, 1);
  assert.equal(plannedMinutes(job(workspace)), 240);
});

test("multi-part quantities are priced on the server and approval reserves available stock", () => {
  let workspace = revise(seed());
  assert.equal(job(workspace).estimate, 142);
  workspace = act(workspace, "approve", "customer");
  assert.equal(
    stockSummary(workspace).find((part) => part.id === "pads").reserved,
    2,
  );
  assert.equal(
    stockSummary(workspace).find((part) => part.id === "tube").available,
    5,
  );
  workspace = act(workspace, "advance");
  assert.equal(
    stockSummary(workspace).find((part) => part.id === "pads").onHand,
    2,
  );
  assert.equal(
    stockSummary(workspace).find((part) => part.id === "pads").reserved,
    0,
  );
  assert.equal(workspace.stockMovements.length, 2);
  assert.equal(job(workspace).status, "quality");
});
test("short stock pauses an approved repair until a real receipt makes reservation possible", () => {
  let workspace = revise(seed(), 5);
  workspace = act(workspace, "approve", "customer");
  assert.equal(job(workspace).status, "waiting_parts");
  assert.equal(job(workspace).approved, true);
  assert.throws(() => act(workspace, "parts-arrived"), /Receive enough stock/);
  workspace = workshopAction(
    workspace,
    { action: "receive-stock", partId: "pads", quantity: 1 },
    now,
  ).workspace;
  workspace = act(workspace, "parts-arrived");
  assert.equal(job(workspace).status, "repairing");
  assert.equal(
    stockSummary(workspace).find((part) => part.id === "pads").available,
    0,
  );
});
test("cancellation and revision release reservations without consuming stock", () => {
  let workspace = act(revise(seed()), "approve", "customer");
  const cancelled = act(workspace, "cancel", "workshop", {
    reasonId: "customer-request",
  });
  assert.equal(
    stockSummary(cancelled).find((part) => part.id === "pads").available,
    4,
  );
  assert.equal(cancelled.stockMovements.length, 0);
  workspace = act(workspace, "revise", "workshop", {
    partsId: "chain",
    labourId: "standard",
    reasonId: "replacement",
  });
  assert.equal(
    stockSummary(workspace).find((part) => part.id === "pads").reserved,
    0,
  );
  assert.equal(job(workspace).approved, false);
});
test("a competing repair cannot reserve stock already promised to another job", () => {
  let workspace = act(revise(seed(), 4), "approve", "customer");
  workspace = repairAction(
    workspace,
    {
      jobId: "NL-2402",
      role: "workshop",
      action: "revise",
      partsId: "pads",
      labourId: "standard",
      reasonId: "replacement",
    },
    now,
  );
  workspace = repairAction(
    workspace,
    { jobId: "NL-2402", role: "customer", action: "approve", quoteVersion: 2 },
    now,
  );
  assert.equal(
    workspace.jobs.find((item) => item.id === "NL-2402").status,
    "waiting_parts",
  );
  assert.equal(
    stockSummary(workspace).find((part) => part.id === "pads").reserved,
    4,
  );
});
test("scheduled work cannot be released before all quality checks pass", () => {
  let workspace = workshopAction(
    seed(),
    {
      action: "schedule",
      jobId: "NL-2401",
      dueDate: "2026-10-05",
      mechanicId: "lee",
      priority: "high",
    },
    now,
  ).workspace;
  workspace = act(workspace, "approve", "customer");
  workspace = act(workspace, "advance");
  assert.throws(() => act(workspace, "advance"), /four quality checks/);
  for (const check of qualityChecks)
    workspace = workshopAction(
      workspace,
      { action: "check", jobId: "NL-2401", checkId: check.id, passed: true },
      now,
    ).workspace;
  workspace = act(workspace, "advance");
  assert.equal(job(workspace).status, "ready");
  assert.equal(Object.values(job(workspace).checks).filter(Boolean).length, 4);
});
test("scheduling rejects impossible dates and exceeding daily mechanic capacity without changing records", () => {
  let workspace = seed();
  for (const item of workspace.jobs) delete item.dueDate;
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const result = create(workspace, "overhaul");
    workspace = result.workspace;
    ids.push(result.repairId);
  }
  for (const id of ids.slice(0, 2))
    workspace = workshopAction(
      workspace,
      {
        action: "schedule",
        jobId: id,
        dueDate: "2026-10-05",
        mechanicId: "lee",
        priority: "routine",
      },
      now,
    ).workspace;
  const snapshot = JSON.stringify(workspace);
  assert.throws(
    () =>
      workshopAction(
        workspace,
        {
          action: "schedule",
          jobId: ids[2],
          dueDate: "2026-10-05",
          mechanicId: "lee",
          priority: "routine",
        },
        now,
      ),
    /eight hours/,
  );
  assert.throws(
    () =>
      workshopAction(
        workspace,
        {
          action: "schedule",
          jobId: ids[2],
          dueDate: "2026-02-30",
          mechanicId: "lee",
          priority: "routine",
        },
        now,
      ),
    /valid date/,
  );
  assert.equal(JSON.stringify(workspace), snapshot);
});
test("catalogue price changes affect new work while historical estimates stay fixed", () => {
  let workspace = seed();
  const original = job(workspace).estimate;
  workspace = workshopAction(
    workspace,
    { action: "catalog", serviceId: "tune", price: 90, enabled: true },
    now,
  ).workspace;
  const result = create(workspace, "tune");
  assert.equal(result.workspace.jobs[0].estimate, 90);
  assert.equal(job(result.workspace).estimate, original);
  const advanced = repairAction(
    result.workspace,
    { action: "advance", role: "workshop", jobId: result.repairId },
    now,
  );
  const revised = repairAction(
    advanced,
    {
      action: "revise",
      role: "workshop",
      jobId: result.repairId,
      partsId: "pads",
      labourId: "standard",
      reasonId: "inspection",
    },
    now,
  );
  assert.equal(revised.jobs[0].estimate, 115);
});
test("inactive services, forged part prices, duplicate lines and invalid stock quantities are rejected", () => {
  const workspace = workshopAction(
    seed(),
    { action: "catalog", serviceId: "brake", price: 40, enabled: false },
    now,
  ).workspace;
  assert.throws(() => create(workspace, "brake"), /active repair type/);
  for (const lines of [
    [{ id: "pads", quantity: 1, unitPrice: 1 }],
    [
      { id: "pads", quantity: 1 },
      { id: "pads", quantity: 1 },
    ],
    [{ id: "tube", quantity: -1 }],
  ])
    assert.throws(
      () =>
        act(workspace, "revise", "workshop", {
          partLines: lines,
          labourId: "standard",
          reasonId: "inspection",
        }),
      /distinct catalogue/,
    );
  for (const quantity of [-1, 0, 1.5, 51])
    assert.throws(
      () =>
        workshopAction(
          workspace,
          { action: "receive-stock", partId: "pads", quantity },
          now,
        ),
      /one and fifty/,
    );
});
test("payment records use the current approved total and cannot be recorded twice", () => {
  let workspace = act(seed(), "approve", "customer");
  assert.throws(
    () =>
      workshopAction(
        workspace,
        { action: "record-payment", jobId: "NL-2401", method: "cash" },
        now,
      ),
    /ready or collected/,
  );
  for (let i = 0; i < 3; i++) workspace = act(workspace, "advance");
  workspace = workshopAction(
    workspace,
    { action: "record-payment", jobId: "NL-2401", method: "cash" },
    now,
  ).workspace;
  assert.equal(job(workspace).payment.amount, 80);
  assert.throws(
    () =>
      workshopAction(
        workspace,
        { action: "record-payment", jobId: "NL-2401", method: "cash" },
        now,
      ),
    /one payment/,
  );
  assert.equal(workshopReport(workspace).recordedPayments, 80);
  assert.equal(workshopReport(workspace).outstanding, 0);
});
test("custom intake is accepted only for a protected local workshop", () => {
  const input = {
    action: "create",
    requestId: randomUUID(),
    serviceId: "brake",
    bikeId: "city",
    issueId: "brakes",
    collection: false,
    rider: "Local customer",
    bike: "Trek FX",
    issue: "Rear brake rub",
  };
  assert.throws(
    () => workshopAction(seed(), input, now),
    /protected local workshop/,
  );
  const created = workshopAction(seed(), input, now, {
    allowPersonalData: true,
  });
  assert.equal(created.workspace.jobs[0].bike, "Trek FX");
  assert.equal(created.workspace.jobs[0].rider, "Local customer");
});
test("notes stay bounded and closed repair records cannot acquire further workshop notes", () => {
  let workspace = workshopAction(
    seed(),
    { action: "add-note", jobId: "NL-2401", note: "<b>Inspect brake pads</b>" },
    now,
  ).workspace;
  assert.equal(job(workspace).history.at(-1).note, "<b>Inspect brake pads</b>");
  assert.throws(
    () =>
      workshopAction(
        workspace,
        { action: "add-note", jobId: "NL-2401", note: "x".repeat(401) },
        now,
      ),
    /four hundred/,
  );
  workspace = act(workspace, "cancel", "customer", {
    reasonId: "customer-request",
  });
  assert.throws(
    () =>
      workshopAction(
        workspace,
        { action: "add-note", jobId: "NL-2401", note: "Changed" },
        now,
      ),
    /closed/,
  );
});
test("queue searches repair types and prioritizes overdue high-priority jobs", () => {
  const workspace = seed();
  assert.equal(queueJobs(workspace, { search: "wheel true" }).length, 1);
  job(workspace).dueDate = "2026-10-04";
  assert.equal(
    queueJobs(workspace, { status: "overdue" }, "2026-10-05")[0].id,
    "NL-2401",
  );
  assert.equal(queueJobs(workspace, { sort: "value" })[0].estimate, 80);
});
test("workshop API preserves idempotent intake and rejects stale cross-screen writes", async () => {
  const records = new Map();
  const api = createApi(
    {
      getWorkspace: async (id) => structuredClone(records.get(id)),
      setWorkspace: async (id, value) =>
        records.set(id, structuredClone(value)),
      transaction: async (fn) => fn(),
    },
    { now: () => now },
  );
  const call = (path, body, cookie = "") =>
    api(
      new Request("https://workshop.test" + path, {
        method: body ? "POST" : "GET",
        headers: { "content-type": "application/json", cookie },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
  const start = await call("/api/tracker", {});
  const cookie = start.headers.get("set-cookie").split(";")[0];
  let workspace = (await start.json()).workspace;
  const input = {
    action: "create",
    requestId: randomUUID(),
    bikeId: "city",
    issueId: "brakes",
    serviceId: "hydraulic",
    collection: false,
    revision: workspace.revision,
  };
  const created = await call("/api/workshop/actions", input, cookie);
  assert.equal(created.status, 200);
  workspace = (await created.json()).workspace;
  const stale = await call(
    "/api/workshop/actions",
    {
      action: "receive-stock",
      partId: "tube",
      quantity: 1,
      revision: input.revision,
    },
    cookie,
  );
  assert.equal(stale.status, 409);
  const repeat = await call(
    "/api/workshop/actions",
    { ...input, revision: workspace.revision },
    cookie,
  );
  assert.equal((await repeat.json()).workspace.jobs.length, 4);
  const price = await call(
    "/api/workshop/actions",
    {
      action: "catalog",
      serviceId: "tune",
      price: 90,
      enabled: true,
      revision: workspace.revision,
    },
    cookie,
  );
  assert.equal(price.status, 200);
  const menu = await call("/api/services", undefined, cookie);
  assert.equal(
    (await menu.json()).services.find((item) => item.id === "tune").price,
    90,
  );
  assert.equal((await call("/api/workshop", undefined, "")).status, 401);
});
