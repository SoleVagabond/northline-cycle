import { calculateEstimate } from "./services.js";
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
    parts: "Parts would be quoted separately; this demo adds no parts charge.",
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
export function transitionJob(job, { role, action }, now = new Date()) {
  const index = stages.findIndex((stage) => stage.id === job.status);
  let next;
  let note;
  if (
    action === "approve" &&
    role === "customer" &&
    job.status === "approval"
  ) {
    next = "repairing";
    note = `Estimate of $${job.estimate} approved. Agreed work started.`;
  } else if (
    action === "advance" &&
    role === "workshop" &&
    !["approval", "collected"].includes(job.status)
  ) {
    next = stages[index + 1]?.id;
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
    history: [...job.history, { stage: next, at: stamp, note }],
  };
}
