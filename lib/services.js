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
    category: "essentials",
    name: "Safety check",
    price: 25,
    duration: "30 minutes",
    description:
      "Brakes, tyres, gears, and a careful once-over before your next ride.",
  },
  {
    id: "puncture",
    category: "essentials",
    name: "Puncture repair",
    price: 20,
    duration: "30 minutes",
    description:
      "Tyre inspection and tube fitting. Replacement parts are quoted separately.",
  },
  {
    id: "tune",
    category: "tune-ups",
    name: "Everyday tune-up",
    price: 65,
    duration: "90 minutes",
    description:
      "Clean shifting, balanced brakes, and the small adjustments that make a big difference.",
  },
  {
    id: "overhaul",
    category: "tune-ups",
    name: "Full refresh",
    price: 120,
    duration: "Half a day",
    description:
      "A thorough service for a well-loved bike, ready for the miles ahead.",
  },
  {
    id: "drivetrain",
    category: "specialist",
    name: "Drivetrain clean",
    price: 45,
    duration: "60 minutes",
    description:
      "Give your chain and gears a clean start. Inspection and lubrication included.",
  },
  {
    id: "wheel",
    category: "specialist",
    name: "Wheel true",
    price: 35,
    duration: "45 minutes",
    description:
      "A steadier spin with spoke tension checked and the wheel brought back into line.",
  },
];
export const repairTypes = [
  ...services.map((item) => ({
    ...item,
    minutes: {
      safety: 30,
      puncture: 30,
      tune: 90,
      overhaul: 240,
      drivetrain: 60,
      wheel: 45,
    }[item.id],
    includes: {
      safety: [
        "Brake and tyre inspection",
        "Fastener check",
        "Written findings",
      ],
      puncture: [
        "Tyre inspection",
        "Tube fitting labour",
        "Inflation and leak check",
      ],
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
    category: "essentials",
    name: "Brake service",
    price: 40,
    minutes: 45,
    duration: "45 minutes",
    description:
      "Pad inspection, alignment and cable tension for confident stopping.",
    includes: ["Pad and rotor inspection", "Brake alignment", "Stopping test"],
  },
  {
    id: "chain-fit",
    category: "essentials",
    name: "Chain replacement",
    price: 25,
    minutes: 30,
    duration: "30 minutes",
    description: "Correctly sized chain fitted and checked through the gears.",
    includes: [
      "Drivetrain wear check",
      "Chain fitting labour",
      "Shifting test",
    ],
  },
  {
    id: "cable",
    category: "essentials",
    name: "Cable replacement",
    price: 30,
    minutes: 45,
    duration: "45 minutes",
    description:
      "Fresh routing and adjustment for a tired brake or gear cable.",
    includes: ["Cable routing", "Fitting labour", "Final adjustment"],
  },
  {
    id: "bearing",
    category: "specialist",
    name: "Bearing service",
    price: 55,
    minutes: 60,
    duration: "60 minutes",
    description: "Inspect, clean and adjust a hub or headset bearing assembly.",
    includes: [
      "Bearing inspection",
      "Cleaning and lubrication",
      "Preload adjustment",
    ],
  },
  {
    id: "hydraulic",
    category: "specialist",
    name: "Hydraulic brake bleed",
    price: 60,
    minutes: 60,
    duration: "60 minutes",
    description:
      "Bleed one hydraulic brake and verify firm, reliable operation.",
    includes: [
      "Leak inspection",
      "One-brake bleed labour",
      "Pressure and stopping check",
    ],
  },
  {
    id: "ebike",
    category: "specialist",
    name: "E-bike mechanical check",
    price: 50,
    minutes: 45,
    duration: "45 minutes",
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
export function calculateEstimate(serviceId, collection = false) {
  const service = repairTypes.find((item) => item.id === serviceId);
  if (!service) throw new RangeError("Unknown service");
  return service.price + (collection ? 15 : 0);
}
