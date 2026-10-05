import { randomUUID } from "node:crypto";
import {
  repairTypes,
  mechanics,
  qualityChecks,
  workshopDate,
} from "./services.js";
import { partOptions, quoteFor } from "./quotes.js";
import {
  createSampleRepair,
  transitionJob,
  demoBikes,
  demoIssues,
  maxRepairs,
} from "./repairs.js";

import {
  closed,
  catalogue,
  stockSummary,
  plannedMinutes,
} from "./workshop-query.js";
export { catalogue } from "./workshop-query.js";
export function operationsWorkspace(original) {
  const workspace = structuredClone(original);
  workspace.inventory ||= partOptions
    .filter((part) => part.price)
    .map((part, index) => ({
      id: part.id,
      onHand: [4, 2, 6, 5, 2, 3][index],
      reorderAt: 2,
    }));
  workspace.stockMovements ||= [];
  workspace.servicePrices ||= {};
  return workspace;
}
export { stockSummary } from "./workshop-query.js";
const partLines = (job) =>
  quoteFor(job).parts.map((part) => ({
    id: part.id,
    quantity: part.quantity || 1,
  }));
function reserveParts(workspace, job) {
  job.reservedParts = [];
  const stock = stockSummary(workspace);
  const lines = partLines(job);
  if (
    lines.some(
      (line) =>
        stock.find((part) => part.id === line.id).available < line.quantity,
    )
  )
    return false;
  job.reservedParts = lines;
  return true;
}
export function repairAction(original, input, now) {
  const workspace = operationsWorkspace(original);
  const index = workspace.jobs.findIndex((job) => job.id === input.jobId);
  if (index < 0) throw new Error("Choose a repair in this workspace.");
  const before = workspace.jobs[index];
  const after = transitionJob(before, input, now);
  workspace.jobs[index] = after;
  if (["revise", "cancel"].includes(input.action)) after.reservedParts = [];
  if (input.action === "approve" && !reserveParts(workspace, after)) {
    after.status = "waiting_parts";
    after.history.at(-1).stage = "waiting_parts";
    after.history.at(-1).note +=
      " Required parts are unavailable; work is paused until stock arrives.";
  }
  if (input.action === "parts-arrived" && !reserveParts(workspace, after))
    throw new Error("Receive enough stock before resuming this repair.");
  if (
    input.action === "advance" &&
    before.status === "repairing" &&
    partLines(after).length
  ) {
    if (!reserveParts(workspace, after))
      throw new Error(
        "The approved parts are unavailable. Pause for parts and receive stock before continuing.",
      );
    if (workspace.stockMovements.length + after.reservedParts.length > 200)
      throw new Error("This workspace has reached its stock-history limit.");
    for (const line of after.reservedParts) {
      workspace.inventory.find((item) => item.id === line.id).onHand -=
        line.quantity;
      workspace.stockMovements.push({
        id: randomUUID(),
        partId: line.id,
        quantity: -line.quantity,
        reason: "Repair completed",
        jobId: after.id,
        at: now.toISOString(),
      });
    }
    after.reservedParts = [];
    after.partsUsed = partLines(after);
  }
  return workspace;
}
function journal(job, note, action, now) {
  if (job.history.length >= 128)
    throw new Error("This repair has reached its journal limit.");
  job.updatedAt = now.toISOString();
  job.history.push({
    stage: job.status,
    at: now.toISOString(),
    note,
    action,
    role: "workshop",
    quoteVersion: quoteFor(job).version,
  });
}
function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
function checkCapacity(workspace, job, dueDate, mechanicId) {
  const mechanic = mechanics.find((item) => item.id === mechanicId);
  const booked = workspace.jobs
    .filter(
      (item) =>
        item.id !== job.id &&
        !closed(item) &&
        item.dueDate === dueDate &&
        item.mechanicId === mechanicId,
    )
    .reduce((sum, item) => sum + plannedMinutes(item), 0);
  if (booked + plannedMinutes(job) > mechanic.capacity)
    throw new Error(
      `${mechanic.name} would exceed the ${mechanic.capacity}-minute planning limit on that date. Choose another date or mechanic.`,
    );
}
export function workshopAction(
  original,
  input,
  now,
  { allowPersonalData = false } = {},
) {
  const schemas = {
    create: [
      "requestId",
      "bikeId",
      "issueId",
      "serviceId",
      "collection",
      "rider",
      "bike",
      "issue",
    ],
    schedule: [
      "jobId",
      "dueDate",
      "mechanicId",
      "priority",
      "benchMinutes",
      "expectedReadyDate",
    ],
    check: ["jobId", "checkId", "passed", "notApplicable"],
    "receive-stock": ["partId", "quantity"],
    "record-payment": ["jobId", "method"],
    catalog: ["serviceId", "price", "enabled"],
    "add-note": ["jobId", "note"],
  };
  const schema = schemas[input.action];
  if (
    !schema ||
    Object.keys(input).some(
      (key) => !["action", "revision", "role", ...schema].includes(key),
    ) ||
    (input.role && input.role !== "workshop")
  )
    throw new Error("Use the available workshop actions and fields.");
  const workspace = operationsWorkspace(original);
  const job = workspace.jobs.find((item) => item.id === input.jobId);
  if (schema.includes("jobId") && !job)
    throw new Error("Choose a repair in this workspace.");
  if (job && closed(job) && input.action !== "record-payment")
    throw new Error(
      "This repair is closed; its operational history cannot be changed.",
    );
  switch (input.action) {
    case "create": {
      const custom = ["rider", "bike", "issue"].some((key) => key in input);
      if (
        custom &&
        (!allowPersonalData ||
          ["rider", "bike", "issue"].some(
            (key) =>
              typeof input[key] !== "string" ||
              !input[key].trim() ||
              input[key].length > (key === "issue" ? 400 : 80) ||
              /[\u0000-\u001f]/.test(input[key]),
          ))
      )
        throw new Error(
          "Custom customer and bike details are available only in the protected local workshop. Complete all three fields.",
        );
      if (
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
          input.requestId || "",
        ) ||
        !demoBikes.some((item) => item.id === input.bikeId) ||
        !demoIssues.some((item) => item.id === input.issueId) ||
        typeof input.collection !== "boolean"
      )
        throw new Error(
          "Choose a sample bike, concern and collection preference.",
        );
      const service = catalogue(workspace).find(
        (item) => item.id === input.serviceId && item.enabled,
      );
      if (!service) throw new Error("Choose an active repair type.");
      const signature = JSON.stringify([
        input.bikeId,
        input.issueId,
        input.serviceId,
        input.collection,
        input.rider || "",
        input.bike || "",
        input.issue || "",
      ]);
      const previous = workspace.jobs.find(
        (item) => item.requestId === input.requestId,
      );
      if (previous) {
        if (previous.creationSignature !== signature)
          throw new Error(
            "The saved request has different choices. Start a new repair.",
          );
        return { workspace, repairId: previous.id, duplicate: true };
      }
      if (workspace.jobs.length >= (allowPersonalData ? 250 : maxRepairs))
        throw new Error(
          "This portfolio workspace is full. Export it before starting fresh.",
        );
      const created = createSampleRepair(
        { ...input, slot: "flexible" },
        randomUUID(),
        now,
      );
      created.basePrice = service.price;
      if (custom) {
        created.rider = input.rider.trim();
        created.bike = input.bike.trim();
        created.issue = input.issue.trim();
      }
      created.estimate = service.price + (created.collection ? 15 : 0);
      created.requiresChecklist = true;
      created.creationSignature = signature;
      created.priority = "routine";
      workspace.jobs.unshift(created);
      return { workspace, repairId: created.id };
    }
    case "schedule": {
      const mechanic = mechanics.find((item) => item.id === input.mechanicId);
      if (
        !mechanic ||
        !validDate(input.dueDate) ||
        !["routine", "high"].includes(input.priority)
      )
        throw new Error("Choose a valid date, mechanic and priority.");
      const today = workshopDate(now);
      if (
        input.dueDate < today ||
        Date.parse(input.dueDate) > Date.parse(today) + 90 * 86400000
      )
        throw new Error(
          "Choose a planned work date from today through the next ninety days.",
        );
      if (
        input.benchMinutes !== undefined &&
        input.benchMinutes !== null &&
        (!Number.isInteger(input.benchMinutes) ||
          input.benchMinutes < 1 ||
          input.benchMinutes > 480)
      )
        throw new Error(
          "Enter a job-specific planning estimate from 1 to 480 minutes, or leave it unestimated.",
        );
      const collectionDate =
        input.expectedReadyDate === undefined
          ? job.expectedReadyDate
          : input.expectedReadyDate;
      if (
        collectionDate !== undefined &&
        collectionDate !== null &&
        (!validDate(collectionDate) ||
          collectionDate < input.dueDate ||
          Date.parse(collectionDate) > Date.parse(today) + 90 * 86400000)
      )
        throw new Error(
          "The expected collection date must be on or after the planned work date and within ninety days.",
        );
      if (input.benchMinutes !== undefined)
        job.benchMinutes = input.benchMinutes;
      if (input.expectedReadyDate !== undefined)
        job.expectedReadyDate = input.expectedReadyDate || null;
      checkCapacity(workspace, job, input.dueDate, input.mechanicId);
      job.dueDate = input.dueDate;
      job.mechanicId = mechanic.id;
      job.mechanic = mechanic.name;
      job.priority = input.priority;
      job.requiresChecklist = true;
      journal(
        job,
        `Work planned for ${input.dueDate} with ${mechanic.name}. ${job.benchMinutes ? `${job.benchMinutes} minutes budgeted internally.` : "Work time not yet estimated."} ${job.expectedReadyDate ? `Expected collection: ${job.expectedReadyDate}; subject to progress and parts.` : "Collection date not confirmed."}`,
        "schedule",
        now,
      );
      break;
    }
    case "check": {
      const check = qualityChecks.find((item) => item.id === input.checkId);
      if (
        !check ||
        typeof input.passed !== "boolean" ||
        (input.notApplicable !== undefined &&
          typeof input.notApplicable !== "boolean") ||
        job.status !== "quality"
      )
        throw new Error(
          "Quality checks can be recorded during the ride-check stage.",
        );
      job.checks ||= {};
      job.checkExceptions ||= {};
      if (input.notApplicable === true) {
        if (check.id !== "gears" || input.passed !== false)
          throw new Error(
            "Only a bike without gear shifting can omit the gear-shift check.",
          );
        if (job.checkExceptions.gears)
          throw new Error(
            "The gear check is already recorded as not applicable.",
          );
        job.checks.gears = false;
        job.checkExceptions.gears = {
          reason: "No gear shifting fitted",
          at: now.toISOString(),
        };
        journal(
          job,
          "Gear-shift check not applicable: no gear shifting fitted.",
          "check",
          now,
        );
        break;
      }
      if (
        job.checks[check.id] === input.passed &&
        !job.checkExceptions[check.id]
      )
        throw new Error("That quality check is already recorded.");
      job.checks[check.id] = input.passed;
      delete job.checkExceptions[check.id];
      journal(
        job,
        `${input.passed ? "Passed" : "Reopened"}: ${check.name}.`,
        "check",
        now,
      );
      break;
    }
    case "receive-stock": {
      const part = workspace.inventory.find((item) => item.id === input.partId);
      if (
        !part ||
        !Number.isInteger(input.quantity) ||
        input.quantity < 1 ||
        input.quantity > 50 ||
        part.onHand + input.quantity > 500 ||
        workspace.stockMovements.length >= 200
      )
        throw new Error(
          "Choose a part and receive between one and fifty units, within the stock limits.",
        );
      part.onHand += input.quantity;
      workspace.stockMovements.push({
        id: randomUUID(),
        partId: part.id,
        quantity: input.quantity,
        reason: "Stock received",
        at: now.toISOString(),
      });
      break;
    }
    case "record-payment": {
      if (
        !["ready", "collected"].includes(job.status) ||
        job.payment ||
        !["cash", "card", "bank"].includes(input.method)
      )
        throw new Error(
          "Record one payment for a ready or collected repair using an available method.",
        );
      job.payment = {
        amount: quoteFor(job).total,
        method: input.method,
        at: now.toISOString(),
      };
      journal(
        job,
        `Payment recorded: $${job.payment.amount} by ${input.method}. No external charge was made.`,
        "record-payment",
        now,
      );
      break;
    }
    case "catalog": {
      if (
        !repairTypes.some((item) => item.id === input.serviceId) ||
        !Number.isInteger(input.price) ||
        input.price < 5 ||
        input.price > 1000 ||
        typeof input.enabled !== "boolean"
      )
        throw new Error(
          "Use a catalogue repair type, a whole-dollar price from $5 to $1,000, and an active setting.",
        );
      if (
        !input.enabled &&
        !catalogue(workspace).some(
          (item) => item.id !== input.serviceId && item.enabled,
        )
      )
        throw new Error(
          "Keep at least one repair type active for new repairs.",
        );
      workspace.servicePrices[input.serviceId] = {
        price: input.price,
        enabled: input.enabled,
      };
      break;
    }
    case "add-note": {
      if (
        typeof input.note !== "string" ||
        !input.note.trim() ||
        input.note.length > 400 ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input.note)
      )
        throw new Error(
          "Write a workshop note from one to four hundred characters.",
        );
      journal(job, input.note.trim(), "add-note", now);
      break;
    }
  }
  return { workspace };
}
