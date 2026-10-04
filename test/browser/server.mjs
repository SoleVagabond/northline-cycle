import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createApp } from "../../server.js";

// Each run gets new, ignored sample storage. Existing demo workspaces are untouched.
const app = createApp({
  dataFile: join(
    process.cwd(),
    "work",
    "browser-data",
    randomUUID(),
    "enquiries.ndjson",
  ),
});
app.listen(8796, "127.0.0.1", () =>
  console.log("Browser checks: http://127.0.0.1:8796"),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => app.close(() => process.exit(0)));
