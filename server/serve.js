"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { loadConfig } = require("./config");

const cfg = loadConfig();
const LEGACY = path.join(cfg.root, "legacy");
const CLOUD = path.join(cfg.root, "cloud");
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
  if (decoded === "/legacy" || decoded === "/legacy/" || decoded.startsWith("/legacy/")) {
    return { redirect: "/" };
  }
  if (decoded.startsWith("/cloud/")) {
    const resolved = path.normalize(path.join(CLOUD, decoded.slice(7)));
    if (!resolved.startsWith(CLOUD)) return null;
    return { file: resolved };
  }
  const rel = decoded === "/" ? "/index.html" : decoded;
  const resolved = path.normalize(path.join(LEGACY, rel));
  if (!resolved.startsWith(LEGACY)) return null;
  return { file: resolved };
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

  const resolved = resolveFile(url);
  if (!resolved) return send(res, 403, "Forbidden");
  if (resolved.redirect) {
    return send(res, 301, "", "text/plain; charset=utf-8", { Location: resolved.redirect });
  }

  fs.readFile(resolved.file, function (err, data) {
    if (err) {
      if (err.code === "ENOENT") return send(res, 404, "Not found");
      return send(res, 500, "Server error");
    }
    send(res, 200, data, MIME[path.extname(resolved.file).toLowerCase()] || "application/octet-stream");
  });
});

server.listen(port, host, function () {
  console.log("MyFocusly — servidor estatico (sem dados de usuario)");
  console.log("URL:", cfg.appUrl);
  console.log("Escutando:", "http://" + host + ":" + port);
  if (isProd) console.log("NODE_ENV=production");
});

module.exports = server;
