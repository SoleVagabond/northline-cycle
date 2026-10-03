import { mkdir, copyFile, readFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const publishRoot = path.resolve(root, "public");
if (path.dirname(publishRoot) !== path.resolve(root))
  throw new Error("Invalid publish directory");
await rm(publishRoot, { recursive: true, force: true });
const publicFiles = [
  "index.html",
  "case-study.html",
  "project-brief.md",
  "styles.css",
  "app.js",
  "tracker.js",
  "assets/favicon.svg",
  "assets/share.jpg",
  "docs/tracker-desktop.jpg",
  "lib/services.js",
  "lib/repairs.js",
  "lib/demo-session.js",
  ...["safety", "puncture", "tune", "overhaul", "drivetrain", "wheel"].map(
    (id) => `assets/${id}.svg`,
  ),
];
for (const file of publicFiles) {
  const destination = path.join(root, "public", file);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(path.join(root, file), destination);
}
console.log(
  `Prepared ${publicFiles.length} public files. Backend code and data are excluded.`,
);
const siteUrl =
  process.env.SITE_URL ||
  (process.env.CONTEXT === "production"
    ? process.env.URL
    : process.env.DEPLOY_PRIME_URL);
if (siteUrl) {
  const base = new URL(siteUrl).origin;
  for (const file of ["index.html", "case-study.html"]) {
    const destination = path.join(publishRoot, file);
    const html = (await readFile(destination, "utf8"))
      .replace(
        'content="/assets/share.jpg"',
        `content="${base}/assets/share.jpg"`,
      )
      .replace(
        "</head>",
        `<link rel="canonical" href="${base}/${file === "index.html" ? "" : file}"></head>`,
      );
    await writeFile(destination, html);
  }
}
