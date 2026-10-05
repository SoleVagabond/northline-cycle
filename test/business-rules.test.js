import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createWorkspace } from "../lib/repairs.js";
import { services, repairTypes, qualityComplete } from "../lib/services.js";
import { quoteFor } from "../lib/quotes.js";
import {
  operationsWorkspace,
  workshopAction,
  repairAction,
} from "../lib/workshop-domain.js";
const now = new Date("2026-10-05T12:00:00Z");
const seed = () => operationsWorkspace(createWorkspace(randomUUID(), now));
const job = (workspace) => workspace.jobs.find((item) => item.id === "NL-2401");
const plan = (workspace, extras = {}) =>
  workshopAction(
    workspace,
    {
      action: "schedule",
      jobId: "NL-2401",
      dueDate: "2026-10-05",
      mechanicId: "alex",
      priority: "routine",
      ...extras,
    },
    now,
  ).workspace;
const revise = (workspace, extras = {}) =>
  repairAction(
    workspace,
    {
      action: "revise",
      role: "workshop",
      jobId: "NL-2401",
      serviceCharge: 85,
      workDescription: "Adjust the rear mechanical brake after inspection.",
      partLines: [],
      reasonId: "inspection",
      ...extras,
    },
    now,
  );
const action = (workspace, action, role = "workshop") =>
  repairAction(
    workspace,
    {
      jobId: "NL-2401",
      action,
      role,
      quoteVersion: quoteFor(job(workspace)).version,
    },
    now,
  );

test("catalog scopes specify units and never manufacture a repair duration", () => {
  for (const service of [...services, ...repairTypes]) {
    assert.ok(service.unit);
    assert.equal(service.duration, undefined);
    assert.equal(service.minutes, undefined);
  }
  assert.match(
    repairTypes.find((item) => item.id === "hydraulic").unit,
    /Per hydraulic brake/,
  );
  assert.match(
    repairTypes.find((item) => item.id === "wheel").unit,
    /Per wheel/,
  );
});

test("work planning and customer collection are distinct; unknown estimates remain unknown", () => {
  const original = seed();
  const workspace = plan(original, {
    benchMinutes: null,
    expectedReadyDate: "2026-10-08",
  });
  assert.equal(job(workspace).dueDate, "2026-10-05");
  assert.equal(job(workspace).expectedReadyDate, "2026-10-08");
  assert.equal(job(workspace).benchMinutes, null);
  assert.equal(job(original).expectedReadyDate, undefined);
  assert.match(job(workspace).history.at(-1).note, /not yet estimated/);
  const changed = plan(workspace, {
    benchMinutes: 115,
    expectedReadyDate: null,
  });
  assert.equal(job(changed).expectedReadyDate, null);
  assert.equal(job(changed).benchMinutes, 115);
});

test("invalid planning budgets and collection dates are rejected atomically", () => {
  const workspace = seed();
  const before = JSON.stringify(workspace);
  for (const benchMinutes of [0, -1, 1.5, 481, "90", false])
    assert.throws(() => plan(workspace, { benchMinutes }), /planning estimate/);
  for (const expectedReadyDate of [
    "2026-10-04",
    "2026-02-30",
    "2027-02-01",
    "",
    false,
    0,
  ])
    assert.throws(
      () => plan(workspace, { expectedReadyDate }),
      /collection date/,
    );
  assert.equal(JSON.stringify(workspace), before);
});

test("rescheduling past the collection expectation requires a revised or cleared collection date", () => {
  const workspace = plan(seed(), { expectedReadyDate: "2026-10-06" });
  assert.throws(
    () => plan(workspace, { dueDate: "2026-10-08" }),
    /collection date/,
  );
  const rescheduled = plan(workspace, {
    dueDate: "2026-10-08",
    expectedReadyDate: null,
  });
  assert.equal(job(rescheduled).dueDate, "2026-10-08");
  assert.equal(job(rescheduled).expectedReadyDate, null);
  assert.equal(job(workspace).expectedReadyDate, "2026-10-06");
});

test("same-price changes in inspected work require a fresh approval and preserve the earlier decision", () => {
  let workspace = revise(seed());
  workspace = action(workspace, "approve", "customer");
  workspace = revise(workspace, {
    workDescription:
      "Replace the rear cable instead of adjusting the original cable.",
  });
  assert.equal(job(workspace).status, "approval");
  assert.equal(job(workspace).approved, false);
  assert.equal(job(workspace).quotes[1].decision, "approved");
  assert.equal(job(workspace).quotes[2].decision, "pending");
  assert.equal(job(workspace).quotes[1].total, job(workspace).quotes[2].total);
  assert.throws(() => action(workspace, "advance"), /unavailable/);
});

test("inspected quotes require compatible part specifications and retain them with the agreed prices", () => {
  for (const specification of [
    undefined,
    "",
    " ",
    "x".repeat(101),
    "bad\npart",
    12,
  ])
    assert.throws(
      () =>
        revise(seed(), {
          partLines: [{ id: "chain", quantity: 1, specification }],
        }),
      /compatible part specification/,
    );
  const workspace = revise(seed(), {
    partLines: [
      { id: "chain", quantity: 1, specification: "Shimano CN-HG701, 11-speed" },
    ],
  });
  assert.equal(
    quoteFor(job(workspace)).parts[0].specification,
    "Shimano CN-HG701, 11-speed",
  );
  assert.equal(quoteFor(job(workspace)).total, 135);
});

test("inspection charges must be bounded whole values with a meaningful work description", () => {
  for (const serviceCharge of [-1, 1.5, 5001, "85", null])
    assert.throws(
      () => revise(seed(), { serviceCharge }),
      /inspected service charge/,
    );
  for (const workDescription of ["", " ", "x".repeat(241), "bad\nwork", null])
    assert.throws(
      () => revise(seed(), { workDescription }),
      /describe the quoted work/,
    );
});

test("a documented no-shifting exception releases a single-speed bike only after the remaining safety checks", () => {
  let workspace = plan(seed());
  workspace = action(workspace, "approve", "customer");
  workspace = action(workspace, "advance");
  workspace = workshopAction(
    workspace,
    {
      action: "check",
      jobId: "NL-2401",
      checkId: "gears",
      passed: false,
      notApplicable: true,
    },
    now,
  ).workspace;
  assert.equal(qualityComplete(job(workspace)), false);
  assert.throws(() => action(workspace, "advance"), /quality checks/);
  for (const checkId of ["brakes", "wheels", "fasteners"])
    workspace = workshopAction(
      workspace,
      { action: "check", jobId: "NL-2401", checkId, passed: true },
      now,
    ).workspace;
  assert.equal(qualityComplete(job(workspace)), true);
  workspace = action(workspace, "advance");
  assert.equal(job(workspace).status, "ready");
  assert.equal(job(workspace).checks.gears, false);
  assert.equal(
    job(workspace).checkExceptions.gears.reason,
    "No gear shifting fitted",
  );
});

test("safety-critical checks cannot be marked not applicable and a gear exception can be reopened", () => {
  let workspace = plan(seed());
  workspace = action(workspace, "approve", "customer");
  workspace = action(workspace, "advance");
  for (const checkId of ["brakes", "wheels", "fasteners"])
    assert.throws(
      () =>
        workshopAction(
          workspace,
          {
            action: "check",
            jobId: "NL-2401",
            checkId,
            passed: false,
            notApplicable: true,
          },
          now,
        ),
      /Only a bike without gear shifting/,
    );
  assert.throws(
    () =>
      workshopAction(
        workspace,
        {
          action: "check",
          jobId: "NL-2401",
          checkId: "gears",
          passed: false,
          notApplicable: "yes",
        },
        now,
      ),
    /during the ride-check/,
  );
  workspace = workshopAction(
    workspace,
    {
      action: "check",
      jobId: "NL-2401",
      checkId: "gears",
      passed: false,
      notApplicable: true,
    },
    now,
  ).workspace;
  workspace = workshopAction(
    workspace,
    { action: "check", jobId: "NL-2401", checkId: "gears", passed: false },
    now,
  ).workspace;
  assert.equal(job(workspace).checkExceptions.gears, undefined);
});
