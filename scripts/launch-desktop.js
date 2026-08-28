"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { loadConfig } = require("../server/config");

const cfg = loadConfig();
const root = cfg.root;
const electronExe = path.join(root, "node_modules", "electron", "dist", "electron.exe");

function waitForServer(url, attempts) {
  return new Promise(function (resolve, reject) {
    let n = 0;
    function tick() {
      n += 1;
      const req = http.get(url.replace(/\/$/, "") + "/health", function (res) {
        res.resume();
        if (res.statusCode === 200) resolve();
        else if (n >= attempts) reject(new Error("health"));
        else setTimeout(tick, 250);
      });
      req.on("error", function () {
        if (n >= attempts) reject(new Error("timeout"));
        else setTimeout(tick, 250);
      });
      req.setTimeout(2000, function () {
        req.destroy();
      });
    }
    tick();
  });
}

function startServer() {
  const child = spawn(process.execPath, [path.join(root, "server", "serve.js")], {
    cwd: root,
    detached: true,
    stdio: "ignore",
    env: Object.assign({}, process.env, {
      FOCUSLY_URL: cfg.appUrl,
      FOCUSLY_HOST: cfg.server.host,
      FOCUSLY_PORT: String(cfg.server.port),
      FOCUSLY_BACKUP_PATH: cfg.backupPath,
    }),
  });
  child.unref();
  return child;
}

function startElectron() {
  if (!fs.existsSync(electronExe)) {
    console.error("Electron nao encontrado. Rode: npm install");
    process.exit(1);
  }
  const child = spawn(electronExe, [root], {
    cwd: root,
    detached: true,
    stdio: "ignore",
    env: Object.assign({}, process.env, {
      FOCUSLY_URL: cfg.appUrl,
      FOCUSLY_BACKUP_PATH: cfg.backupPath,
    }),
  });
  child.unref();
}

async function main() {
  if (cfg.serveLocally) {
    startServer();
    try {
      await waitForServer(cfg.appUrl, 40);
    } catch (e) {
      console.error("Servidor local nao respondeu:", cfg.appUrl);
      process.exit(1);
    }
  }
  startElectron();
}

main();
