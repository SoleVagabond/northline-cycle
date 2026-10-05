import { calculateEstimate } from "./services.js";
import { quoteFor, revisedQuote, cancellationReasons } from "./quotes.js";
export const retentionDays = 7;
export const maxRepairs = 10;
export const demoBikes = [
  { id: "city", label: "City commuter" },
  { id: "road", label: "Weekend road bike" },
  { id: "hybrid", label: "Everyday hybrid" },
  { id: "café", label: "Café cruiser" },
];
export const demoIssues = [
  { id: "brakes", label: "A squeaky rear brake" },
  { id: "gears", label: "Hesitant gear shifting" },
  { id: "wheel", label: "A slight wheel wobble" },
  { id: "routine", label: "Routine care before the next ride" },
];
export function createSampleRepair(input, enquiryId, now = new Date()) {
  const stamp = now.toISOString();
  return {
    id: "NL-" + enquiryId.slice(0, 8).toUpperCase(),
    enquiryId,
    requestId: input.requestId,
    rider: "Jamie R.",
    bike: demoBikes.find((item) => item.id === input.bikeId).label,
    serviceId: input.serviceId,
    estimate: calculateEstimate(input.serviceId, input.collection),
    collection: input.collection,
    preferredTime: input.slot,
    status: "received",
    issue: demoIssues.find((item) => item.id === input.issueId).label,
    mechanic: "Alex",
    parts:
      "Replacement parts can be included in a revised estimate before approval.",
    approved: false,
    updatedAt: stamp,
    history: [
      {
        stage: "received",
        at: stamp,
        note: "Sample request received. Your repair journey starts here.",
      },
    ],
  };
}
export const stages = [
  {
    id: "received",
    label: "Checked in",
    description: "Your bike is safely in the workshop.",
  },
  {
    id: "inspection",
    label: "Inspection",
    description: "We are finding the cause, not just the symptom.",
  },
  {
    id: "approval",
    label: "Your approval",
    description: "Review the estimate before work begins.",
  },
  {
    id: "repairing",
    label: "On the workbench",
    description: "The agreed repairs are under way.",
  },
  {
    id: "quality",
    label: "Ride check",
    description:
      "Brakes, shifting, and the finishing details get a final check.",
  },
  {
    id: "ready",
    label: "Ready to collect",
    description: "Your bike is ready for its next mile.",
  },
  {
    id: "collected",
    label: "Back on the road",
    description: "Collected and rolling again.",
  },
];
export const exceptionStages = [
  {
    id: "waiting_parts",
    label: "Waiting for parts",
    description: "The approved repair is paused until its parts arrive.",
  },
  {
    id: "declined",
    label: "Estimate declined",
    description:
      "Work is paused. The workshop can offer a revised estimate or cancel this repair.",
  },
  {
    id: "cancelled",
    label: "Repair cancelled",
    description:
      "This repair is closed. Its estimates and decision history remain available.",
  },
];
export function workflowStage(job) {
  return job.status === "waiting_parts"
    ? "repairing"
    : job.status === "declined"
      ? "approval"
      : job.status === "cancelled"
        ? job.closedFrom
        : job.status;
}
export function createWorkspace(id, now = new Date()) {
  const stamp = now.toISOString();
  const examples = [
    {
      id: "NL-2401",
      rider: "Jamie R.",
      bike: "City commuter",
      serviceId: "tune",
      estimate: 80,
      collection: true,
      status: "approval",
      issue: "Rear brake squeak and hesitant shifting",
      mechanic: "Alex",
      parts: "No replacement parts required",
      approved: false,
    },
    {
      id: "NL-2402",
      rider: "Morgan T.",
      bike: "Weekend road bike",
      serviceId: "drivetrain",
      estimate: 45,
      collection: false,
      status: "repairing",
      issue: "A tired drivetrain after a wet-weather ride",
      mechanic: "Sam",
      parts: "Clean and lubrication included",
      approved: true,
    },
    {
      id: "NL-2403",
      rider: "Casey L.",
      bike: "Everyday hybrid",
      serviceId: "wheel",
      estimate: 35,
      collection: false,
      status: "received",
      issue: "A slight wobble in the rear wheel",
      mechanic: "Alex",
      parts: "Spokes inspected before any replacement quote",
      approved: false,
    },
  ];
  return {
    id,
    revision: 1,
    createdAt: stamp,
    updatedAt: stamp,
    expiresAt: new Date(now.getTime() + retentionDays * 86400000).toISOString(),
    jobs: examples.map((job) => ({
      ...job,
      updatedAt: stamp,
      history: stages
        .slice(0, stages.findIndex((stage) => stage.id === job.status) + 1)
        .map((stage, index) => ({
          stage: stage.id,
          at: new Date(now.getTime() - (7 - index) * 25 * 60000).toISOString(),
          note:
            stage.id === "approval"
              ? "Inspection complete. Estimate ready for your approval."
              : stage.id === "repairing"
                ? "Estimate approved. Agreed work started."
                : stage.description,
        })),
    })),
  };
}
export function transitionJob(original, input, now = new Date()) {
  const { role, action } = input;
  const job = {
    ...original,
    quotes: (original.quotes || [quoteFor(original)]).map((quote) => ({
      ...quote,
      parts: quote.parts.map((part) => ({ ...part })),
    })),
  };
  if (["collected", "cancelled"].includes(job.status))
    throw new Error(
      "This repair is closed. Its saved history cannot be changed.",
    );
  if (job.history.length >= 128)
    throw new Error(
      "This sample repair has reached its history limit. Start a fresh demo to explore more.",
    );
  const index = stages.findIndex((stage) => stage.id === job.status);
  const quote = quoteFor(job);
  let next;
  let note;
  if (
    action === "approve" &&
    role === "customer" &&
    job.status === "approval"
  ) {
    if ((input.quoteVersion ?? 1) !== quote.version)
      throw new Error(
        "This estimate changed. Review the current version before approving.",
      );
    next = "repairing";
    note = `Estimate of $${job.estimate} approved. Agreed work started.`;
    quote.decision = "approved";
    quote.decidedAt = now.toISOString();
  } else if (
    action === "revise" &&
    role === "workshop" &&
    ["inspection", "approval", "repairing", "declined"].includes(job.status)
  ) {
    const revised = revisedQuote(job, input, now);
    if (
      revised.total === quote.total &&
      revised.labour === quote.labour &&
      JSON.stringify(revised.parts) === JSON.stringify(quote.parts)
    )
      throw new Error(
        "Change the labour or parts before requesting approval for a new estimate.",
      );
    if (["pending", "draft"].includes(quote.decision))
      quote.decision = "superseded";
    job.quotes.push(revised);
    job.estimate = revised.total;
    job.approved = false;
    next = "approval";
    note = `Workshop revised estimate v${revised.version}: $${quote.total} → $${revised.total}. ${revised.reason}. Customer approval is required before work continues.`;
  } else if (
    action === "decline" &&
    role === "customer" &&
    job.status === "approval"
  ) {
    if ((input.quoteVersion ?? 1) !== quote.version)
      throw new Error(
        "This estimate changed. Review the current version before declining.",
      );
    quote.decision = "declined";
    quote.decidedAt = now.toISOString();
    job.approved = false;
    next = "declined";
    note = `Customer declined estimate v${quote.version} of $${quote.total}. Work remains paused.`;
  } else if (
    action === "wait-parts" &&
    role === "workshop" &&
    job.status === "repairing" &&
    job.approved &&
    quote.parts.length
  ) {
    next = "waiting_parts";
    note =
      "Workshop paused the approved repair while waiting for its replacement parts.";
  } else if (
    action === "parts-arrived" &&
    role === "workshop" &&
    job.status === "waiting_parts" &&
    job.approved &&
    quote.decision === "approved"
  ) {
    next = "repairing";
    note =
      "Workshop recorded that the parts arrived. The approved work resumed.";
  } else if (
    action === "cancel" &&
    ((role === "customer" &&
      ["received", "inspection", "approval", "declined"].includes(
        job.status,
      )) ||
      (role === "workshop" &&
        !["ready", "collected", "cancelled"].includes(job.status)))
  ) {
    const reason = cancellationReasons.find(
      (item) => item.id === input.reasonId,
    );
    if (!reason || (role === "customer" && reason.id !== "customer-request"))
      throw new Error("Choose a valid sample cancellation reason.");
    job.closedFrom = workflowStage(job);
    if (["draft", "pending"].includes(quote.decision))
      quote.decision = "cancelled";
    next = "cancelled";
    note = `${role === "customer" ? "Customer" : "Workshop"} cancelled this repair. ${reason.name}. No payment or refund is processed in this demo.`;
  } else if (
    action === "advance" &&
    role === "workshop" &&
    ["received", "inspection", "repairing", "quality", "ready"].includes(
      job.status,
    )
  ) {
    if (
      ["repairing", "quality", "ready"].includes(job.status) &&
      (!job.approved || quote.decision !== "approved")
    )
      throw new Error(
        "Customer approval is required before repair work can continue.",
      );
    next = stages[index + 1]?.id;
    if (next === "approval") quote.decision = "pending";
    note =
      next === "approval"
        ? "Inspection complete. Estimate ready for your approval."
        : stages[index + 1]?.description;
  }
  if (!next)
    throw new Error("That action is unavailable at this repair stage.");
  const stamp = now.toISOString();
  return {
    ...job,
    status: next,
    approved: action === "approve" ? true : job.approved,
    updatedAt: stamp,
    history: [
      ...job.history,
      {
        stage: next,
        at: stamp,
        note,
        role,
        action,
        quoteVersion: quoteFor(job).version,
      },
    ],
  };
}
