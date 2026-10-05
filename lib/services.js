export function workshopDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export const services = [
  {
    id: "safety",
    unit: "Per bike",
    category: "essentials",
    name: "Safety check",
    price: 25,
    description:
      "Brakes, tyres, gears, and a careful once-over before your next ride.",
  },
  {
    id: "puncture",
    unit: "Per wheel · tube-type tyre",
    category: "essentials",
    name: "Puncture repair",
    price: 20,
    description:
      "Tyre inspection and tube fitting. Replacement parts are quoted separately.",
  },
  {
    id: "tune",
    unit: "Per bike · adjustments",
    category: "tune-ups",
    name: "Everyday tune-up",
    price: 65,
    description:
      "Clean shifting, balanced brakes, and the small adjustments that make a big difference.",
  },
  {
    id: "overhaul",
    unit: "Per bike · inspection-led service",
    category: "tune-ups",
    name: "Full refresh",
    price: 120,
    description:
      "Inspection-led cleaning and adjustment. Bearing rebuilds, suspension work and replacement parts require a separate quote.",
  },
  {
    id: "drivetrain",
    unit: "Per bike · external clean",
    category: "specialist",
    name: "Drivetrain clean",
    price: 45,
    description:
      "Give your chain and gears a clean start. Inspection and lubrication included.",
  },
  {
    id: "wheel",
    unit: "Per wheel · minor truing",
    category: "specialist",
    name: "Wheel true",
    price: 35,
    description:
      "Minor truing of one repairable wheel. Broken spokes, damaged rims and wheel builds require inspection and a separate quote.",
  },
];
export const repairTypes = [
  ...services.map((item) => ({
    ...item,
    includes: {
      safety: [
        "Brake and tyre inspection",
        "Fastener check",
        "Written findings",
      ],
      puncture: ["Tyre inspection", "Tube fitting", "Inflation and leak check"],
      tune: [
        "Gear adjustment",
        "Brake adjustment",
        "Lubrication and ride check",
      ],
      overhaul: [
        "Deep clean",
        "Bearing and drivetrain inspection",
        "Full adjustment and ride check",
      ],
      drivetrain: [
        "Chain and cassette clean",
        "Wear measurement",
        "Lubrication",
      ],
      wheel: ["Spoke tension check", "Lateral alignment", "Wheel inspection"],
    }[item.id],
  })),
  {
    id: "brake",
    unit: "Per brake · mechanical adjustment",
    category: "essentials",
    name: "Brake service",
    price: 40,
    description:
      "Inspect and adjust one mechanical brake. Hydraulic bleeding is a separate service.",
    includes: [
      "Pad and braking-surface inspection",
      "Mechanical brake adjustment",
      "Stopping test",
    ],
  },
  {
    id: "chain-fit",
    unit: "Per chain",
    category: "essentials",
    name: "Chain replacement",
    price: 25,
    description: "Correctly sized chain fitted and checked through the gears.",
    includes: ["Drivetrain wear check", "Chain fitting", "Shifting test"],
  },
  {
    id: "cable",
    unit: "Per cable",
    category: "essentials",
    name: "Cable replacement",
    price: 30,
    description:
      "Fresh routing and adjustment for a tired brake or gear cable.",
    includes: ["Cable routing", "Cable fitting", "Final adjustment"],
  },
  {
    id: "bearing",
    unit: "Per hub or headset",
    category: "specialist",
    name: "Bearing service",
    price: 55,
    description:
      "Inspect and service one accessible hub or headset. Press-fit work, seized parts and cartridge replacements are quoted after inspection.",
    includes: [
      "Bearing inspection",
      "Cleaning and lubrication",
      "Preload adjustment",
    ],
  },
  {
    id: "hydraulic",
    unit: "Per hydraulic brake",
    category: "specialist",
    name: "Hydraulic brake bleed",
    price: 60,
    description:
      "Bleed one supported hydraulic brake with the manufacturer-specified fluid. System compatibility is checked before quoting.",
    includes: [
      "Leak inspection",
      "One-brake bleed",
      "Pressure and stopping check",
    ],
  },
  {
    id: "ebike",
    unit: "Per bike · mechanical inspection only",
    category: "specialist",
    name: "E-bike mechanical check",
    price: 50,
    description:
      "Mechanical safety inspection; electrical diagnosis is excluded.",
    includes: [
      "Brake and tyre inspection",
      "Drivetrain check",
      "Mechanical findings",
    ],
  },
];
export const mechanics = [
  { id: "alex", name: "Alex", specialty: "General service", capacity: 480 },
  { id: "sam", name: "Sam", specialty: "Drivetrain & wheels", capacity: 480 },
  { id: "lee", name: "Lee", specialty: "Brakes & bearings", capacity: 480 },
];
export const qualityChecks = [
  { id: "brakes", name: "Brakes stop safely" },
  { id: "gears", name: "Gears shift cleanly" },
  { id: "wheels", name: "Wheels and tyres checked" },
  { id: "fasteners", name: "Fasteners secure; ride check complete" },
];
export const qualityComplete = (job) =>
  qualityChecks.every(
    (check) =>
      job.checks?.[check.id] === true ||
      (check.id === "gears" &&
        job.checkExceptions?.gears?.reason === "No gear shifting fitted"),
  );
export function calculateEstimate(serviceId, collection = false) {
  const service = repairTypes.find((item) => item.id === serviceId);
  if (!service) throw new RangeError("Unknown service");
  return service.price + (collection ? 15 : 0);
}
