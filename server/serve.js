"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { loadConfig } = require("./config");

const cfg = loadConfig();
const PUBLIC = path.join(cfg.root, "client", "public");
const SRC = path.join(cfg.root, "client", "src");
const LEGACY = path.join(cfg.root, "legacy");
const { host, port, isProd } = cfg.server;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

const CACHE_STATIC = isProd ? "public, max-age=3600" : "no-cache";

function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  if (decoded.startsWith("/src/")) {
    const resolved = path.normalize(path.join(SRC, decoded.slice(5)));
    if (!resolved.startsWith(SRC)) return null;
    return resolved;
  }
  if (decoded === "/legacy" || decoded.startsWith("/legacy/")) {
    const rel =
      decoded === "/legacy" || decoded === "/legacy/" ? "/index.html" : decoded.slice(7);
    const resolved = path.normalize(path.join(LEGACY, rel));
    if (!resolved.startsWith(LEGACY)) return null;
    return resolved;
  }
  const rel = decoded === "/" ? "/index.html" : decoded;
  const resolved = path.normalize(path.join(PUBLIC, rel));
  if (!resolved.startsWith(PUBLIC)) return null;
  return resolved;
}

function send(res, status, body, type, extraHeaders) {
  const headers = Object.assign(
    {
      "Content-Type": type || "text/plain; charset=utf-8",
      "Cache-Control": type === "text/html; charset=utf-8" ? "no-cache" : CACHE_STATIC,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
    extraHeaders || {}
  );
  res.writeHead(status, headers);
  res.end(body);
}

const server = http.createServer(function (req, res) {
  const url = req.url || "/";

  if (url === "/health") {
    return send(res, 200, JSON.stringify({ ok: true, app: "myfocusly", mode: "static" }), "application/json; charset=utf-8");
  }

  const filePath = resolveFile(url);
  if (!filePath) return send(res, 403, "Forbidden");

  fs.readFile(filePath, function (err, data) {
    if (err) {
      if (err.code === "ENOENT") return send(res, 404, "Not found");
      return send(res, 500, "Server error");
    }
    send(res, 200, data, MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream");
  });
});

server.listen(port, host, function () {
  console.log("MyFocusly — servidor estatico (sem dados de usuario)");
  console.log("URL:", cfg.appUrl);
  console.log("Escutando:", "http://" + host + ":" + port);
  if (isProd) console.log("NODE_ENV=production");
});

module.exports = server;
