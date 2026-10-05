import { calculateEstimate } from "./services.js";

export const partOptions = [
  { id: "none", name: "No replacement parts", price: 0 },
  { id: "pads", name: "Replacement brake pads", price: 25 },
  { id: "chain", name: "Replacement chain", price: 35 },
  { id: "tube", name: "Replacement inner tube", price: 12 },
];
export const labourOptions = [
  { id: "standard", name: "Original service labour", price: 0 },
  { id: "adjustment", name: "Service + fitting adjustment", price: 20 },
  { id: "extended", name: "Service + extended fitting", price: 40 },
];
export const quoteReasons = [
  { id: "inspection", name: "Inspection found additional work" },
  { id: "replacement", name: "A worn part needs replacement" },
  { id: "alternative", name: "Alternative after the customer declined" },
];
export const cancellationReasons = [
  { id: "customer-request", name: "Customer requested cancellation" },
  { id: "unrepairable", name: "Repair is not practical" },
];
export function quoteFor(job) {
  if (job.quotes?.length) return job.quotes.at(-1);
  return {
    version: 1,
    labour: calculateEstimate(job.serviceId, false),
    labourId: "standard",
    collection: job.collection ? 15 : 0,
    parts: [],
    total: job.estimate,
    reason: "Original service estimate",
    decision: job.approved
      ? "approved"
      : job.status === "approval"
        ? "pending"
        : "draft",
    createdAt: job.history?.[0]?.at || job.updatedAt,
  };
}
export function revisedQuote(job, input, now) {
  const part = partOptions.find((item) => item.id === input.partsId);
  const labour = labourOptions.find((item) => item.id === input.labourId);
  const reason = quoteReasons.find((item) => item.id === input.reasonId);
  if (!part || !labour || !reason)
    throw new Error(
      "Choose the sample parts, labour, and reason for this estimate.",
    );
  if (quoteFor(job).version >= 12)
    throw new Error(
      "This sample repair has reached twelve estimate versions. Start a fresh demo to explore more.",
    );
  const labourPrice = calculateEstimate(job.serviceId, false) + labour.price;
  const collectionPrice = job.collection ? 15 : 0;
  return {
    version: quoteFor(job).version + 1,
    labour: labourPrice,
    labourId: labour.id,
    collection: collectionPrice,
    parts: part.price
      ? [{ id: part.id, name: part.name, price: part.price }]
      : [],
    total: labourPrice + collectionPrice + part.price,
    reason: reason.name,
    decision: "pending",
    createdAt: now.toISOString(),
  };
}
