"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CONFIG_FILE = path.join(ROOT, "focusly.config.json");

function readFileConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch (e) {
    return {};
  }
}

function loadConfig() {
  const file = readFileConfig();
  const isProd = process.env.NODE_ENV === "production";
  const serverBlock = file.server || {};

  const port = Number(
    process.env.PORT ||
      process.env.FOCUSLY_PORT ||
      serverBlock.port ||
      3847
  );

  const host =
    process.env.HOST ||
    process.env.FOCUSLY_HOST ||
    serverBlock.host ||
    (isProd ? "0.0.0.0" : "127.0.0.1");

  const appUrl =
    process.env.FOCUSLY_URL ||
    file.appUrl ||
    "http://127.0.0.1:" + port;

  return {
    root: ROOT,
    appUrl,
    backupPath:
      process.env.FOCUSLY_BACKUP_PATH ||
      file.backupPath ||
      "C:\\Users\\rapha\\Projects\\Backups",
    server: {
      host,
      port,
      isProd,
    },
  };
}

module.exports = { loadConfig, CONFIG_FILE, ROOT };
