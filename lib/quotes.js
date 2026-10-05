import { calculateEstimate } from "./services.js";

export const partOptions = [
  { id: "none", name: "No replacement parts", price: 0 },
  { id: "pads", name: "Replacement brake pads", price: 25 },
  { id: "chain", name: "Replacement chain", price: 35 },
  { id: "tube", name: "Replacement inner tube", price: 12 },
  { id: "cable", name: "Cable and housing", price: 18 },
  { id: "bearing", name: "Bearing set", price: 28 },
  { id: "rotor", name: "Brake rotor", price: 32 },
];
export const labourOptions = [
  { id: "standard", name: "Original service charge", price: 0 },
  {
    id: "adjustment",
    name: "Service + fitting adjustment",
    price: 20,
  },
  {
    id: "extended",
    name: "Service + extended fitting",
    price: 40,
  },
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
    labour: job.basePrice ?? calculateEstimate(job.serviceId, false),
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
  const customCharge = input.serviceCharge !== undefined;
  if (
    (!part && !Array.isArray(input.partLines)) ||
    (!customCharge && !labour) ||
    !reason
  )
    throw new Error(
      "Choose the sample parts, service charge, and reason for this estimate.",
    );
  if (
    customCharge &&
    (!Number.isInteger(input.serviceCharge) ||
      input.serviceCharge < 0 ||
      input.serviceCharge > 5000 ||
      typeof input.workDescription !== "string" ||
      !input.workDescription.trim() ||
      input.workDescription.length > 240 ||
      /[\u0000-\u001f]/.test(input.workDescription))
  )
    throw new Error(
      "Enter the inspected service charge from $0 to $5,000 and describe the quoted work.",
    );
  if (quoteFor(job).version >= 12)
    throw new Error(
      "This sample repair has reached twelve estimate versions. Start a fresh demo to explore more.",
    );
  let lines = part?.price
    ? [{ id: part.id, name: part.name, price: part.price }]
    : [];
  if (input.partLines !== undefined) {
    if (!Array.isArray(input.partLines) || input.partLines.length > 6)
      throw new Error("Choose up to six part lines.");
    const ids = new Set();
    lines = input.partLines.map((line) => {
      const selected = partOptions.find(
        (item) => item.id === line?.id && item.price,
      );
      if (
        !selected ||
        Object.keys(line).some(
          (key) => !["id", "quantity", "specification"].includes(key),
        ) ||
        !Number.isInteger(line.quantity) ||
        line.quantity < 1 ||
        line.quantity > 10 ||
        ids.has(line.id)
      )
        throw new Error(
          "Choose distinct catalogue parts and quantities from one to ten.",
        );
      ids.add(line.id);
      if (
        customCharge &&
        (typeof line.specification !== "string" ||
          !line.specification.trim() ||
          line.specification.length > 100 ||
          /[\u0000-\u001f]/.test(line.specification))
      )
        throw new Error(
          "Record the compatible part specification for each quoted part.",
        );
      return {
        id: selected.id,
        name: selected.name,
        quantity: line.quantity,
        unitPrice: selected.price,
        price: selected.price * line.quantity,
        ...(customCharge ? { specification: line.specification.trim() } : {}),
      };
    });
  }
  const labourPrice = customCharge
    ? input.serviceCharge
    : (job.basePrice ?? calculateEstimate(job.serviceId, false)) + labour.price;
  const collectionPrice = job.collection ? 15 : 0;
  return {
    version: quoteFor(job).version + 1,
    labour: labourPrice,
    labourId: customCharge ? "custom" : labour.id,
    ...(customCharge ? { workDescription: input.workDescription.trim() } : {}),
    collection: collectionPrice,
    parts: lines,
    total:
      labourPrice +
      collectionPrice +
      lines.reduce((sum, line) => sum + line.price, 0),
    reason: reason.name,
    decision: "pending",
    createdAt: now.toISOString(),
  };
}
