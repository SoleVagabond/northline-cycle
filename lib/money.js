export function cents(value) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1000000 ||
    Math.abs(value * 100 - Math.round(value * 100)) > 0.00001
  )
    throw new Error("Enter a price with no more than two decimal places.");
  return Math.round(value * 100);
}
export const sumMoney = (values) =>
  values.reduce((sum, value) => sum + cents(value), 0) / 100;
export const multiplyMoney = (value, quantity) =>
  (cents(value) * quantity) / 100;
export const money = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
