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

const supabaseCfg = path.join(ROOT, "supabase.config.json");
let supabaseJson = null;
if (fs.existsSync(supabaseCfg)) {
  supabaseJson = fs.readFileSync(supabaseCfg, "utf8");
} else if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  supabaseJson = JSON.stringify({
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
  }, null, 2);
}
if (supabaseJson) {
  fs.writeFileSync(path.join(DIST, "supabase.config.json"), supabaseJson);
  fs.writeFileSync(path.join(DIST, "legacy", "supabase.config.json"), supabaseJson);
}

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
