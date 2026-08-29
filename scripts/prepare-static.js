"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const LEGACY = path.join(ROOT, "legacy");
const CLOUD = path.join(ROOT, "cloud");

function rimraf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

rimraf(DIST);
fs.mkdirSync(DIST, { recursive: true });

copyDir(LEGACY, DIST);
if (fs.existsSync(CLOUD)) {
  copyDir(CLOUD, path.join(DIST, "cloud"));
}

const cloudCfgPaths = [path.join(CLOUD, "config.json")];
let cloudJson = null;
for (const p of cloudCfgPaths) {
  if (fs.existsSync(p)) {
    cloudJson = fs.readFileSync(p, "utf8");
    break;
  }
}
if (!cloudJson && process.env.GOOGLE_CLIENT_ID) {
  cloudJson = JSON.stringify({ googleClientId: process.env.GOOGLE_CLIENT_ID }, null, 2);
}
if (cloudJson) {
  const base = path.join(DIST, "cloud");
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(path.join(base, "config.json"), cloudJson);
}

fs.writeFileSync(
  path.join(DIST, "_redirects"),
  ["/legacy      /   301", "/legacy/     /   301", "/legacy/*    /   301", ""].join("\n"),
  "utf8"
);

fs.writeFileSync(
  path.join(DIST, "_headers"),
  [
    "/*",
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "",
    "/cloud/*",
    "  Cache-Control: public, max-age=3600",
    "",
    "/*.html",
    "  Cache-Control: no-cache",
    "",
  ].join("\n"),
  "utf8"
);

console.log("Static build ready:", DIST);
