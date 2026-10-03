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
      "A fresh tube, a tyre inspection, and a little less walking home.",
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
export function calculateEstimate(serviceId, collection = false) {
  const service = services.find((item) => item.id === serviceId);
  if (!service) throw new RangeError("Unknown service");
  return service.price + (collection ? 15 : 0);
}
