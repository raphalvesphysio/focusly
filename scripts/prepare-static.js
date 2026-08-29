"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const PUBLIC = path.join(ROOT, "client", "public");
const SRC = path.join(ROOT, "client", "src");
const LEGACY = path.join(ROOT, "legacy");

function rimraf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

rimraf(DIST);
fs.mkdirSync(DIST, { recursive: true });

copyDir(PUBLIC, DIST);
copyDir(SRC, path.join(DIST, "src"));
copyDir(LEGACY, path.join(DIST, "legacy"));

fs.writeFileSync(
  path.join(DIST, "_redirects"),
  "/legacy    /legacy/index.html   200\n/legacy/   /legacy/index.html   200\n",
  "utf8"
);

fs.writeFileSync(
  path.join(DIST, "_headers"),
  [
    "/*",
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "",
    "/src/*",
    "  Cache-Control: public, max-age=3600",
    "",
    "/*.html",
    "  Cache-Control: no-cache",
    "",
  ].join("\n"),
  "utf8"
);

console.log("Static build ready:", DIST);
