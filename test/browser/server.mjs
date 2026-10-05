import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createApp } from "../../server.js";

// Each run gets new, ignored sample storage. Existing demo workspaces are untouched.
const app = createApp({
  operatorKey: "northline-browser-test-key-only",
  legacyPrivatePaths: false,
  dataFile: join(
    process.cwd(),
    "work",
    "browser-data",
    randomUUID(),
    "enquiries.ndjson",
  ),
});
const port = Number(process.env.NORTHLINE_TEST_PORT || 8796);
app.listen(port, "127.0.0.1", () =>
  console.log(`Browser checks: http://127.0.0.1:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => app.close(() => process.exit(0)));
