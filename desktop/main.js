"use strict";

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog } = require("electron");
const fs = require("fs");
const path = require("path");

const { loadConfig } = require("../server/config");

const cfg = loadConfig();
const ROOT = cfg.root;
const ICON_ICO = path.join(ROOT, "icon.ico");
const ICON_PNG = path.join(ROOT, "icon.png");
const BACKUP_FILENAME = "diario-tarefas-backup.json";
const CONFIG_NAME = "focusly-backup-config.json";
const APP_URL = process.env.FOCUSLY_URL || cfg.appUrl;
const DEFAULT_BACKUP_PATH = process.env.FOCUSLY_BACKUP_PATH || cfg.backupPath;

let win = null;
let tray = null;
let quitting = false;

if (process.platform === "win32") app.setAppUserModelId("com.focusly.app");

function configPath() {
  return path.join(app.getPath("userData"), CONFIG_NAME);
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch (e) {
    return null;
  }
}

function writeConfig(config) {
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), "utf8");
}

function ensureDefaultBackupConfig() {
  const existing = readConfig();
  if (existing && existing.folderPath && fs.existsSync(existing.folderPath)) return existing;
  if (!fs.existsSync(DEFAULT_BACKUP_PATH)) {
    fs.mkdirSync(DEFAULT_BACKUP_PATH, { recursive: true });
  }
  const config = {
    folderPath: DEFAULT_BACKUP_PATH,
    folderName: path.basename(DEFAULT_BACKUP_PATH),
  };
  writeConfig(config);
  return config;
}

function getBackupConfig() {
  return ensureDefaultBackupConfig();
}

function backupFilePath(folderPath) {
  return path.join(folderPath, BACKUP_FILENAME);
}

function appIcon() {
  for (const file of [ICON_ICO, ICON_PNG, path.join(ROOT, "client", "public", "favicon.svg")]) {
    const img = nativeImage.createFromPath(file);
    if (!img.isEmpty()) return img;
  }
  return nativeImage.createEmpty();
}

function trayIcon() {
  return appIcon().resize({ width: 16, height: 16 });
}

function showWindow() {
  if (!win) return;
  win.show();
  win.focus();
}

function buildTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip("Focusly");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Abrir Focusly", click: showWindow },
      { type: "separator" },
      { label: "Sair", click: function () { quitting = true; app.quit(); } },
    ])
  );
  tray.on("double-click", showWindow);
}

function registerBackupIpc() {
  ipcMain.handle("backup:available", function () {
    return true;
  });

  ipcMain.handle("backup:getConfig", function () {
    const config = getBackupConfig();
    if (!config || !config.folderPath) return null;
    return {
      folderPath: config.folderPath,
      folderName: config.folderName || path.basename(config.folderPath),
    };
  });

  ipcMain.handle("backup:chooseFolder", async function () {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      title: "Pasta de backup do Focusly",
    });
    if (result.canceled || !result.filePaths.length) return null;
    const folderPath = result.filePaths[0];
    const config = { folderPath, folderName: path.basename(folderPath) };
    writeConfig(config);
    return { folderName: config.folderName };
  });

  ipcMain.handle("backup:read", function () {
    const config = getBackupConfig();
    if (!config || !config.folderPath) return null;
    const filePath = backupFilePath(config.folderPath);
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (e) {
      return null;
    }
  });

  ipcMain.handle("backup:write", function (_, state) {
    const config = getBackupConfig();
    if (!config || !config.folderPath) throw new Error("no-folder");
    const filePath = backupFilePath(config.folderPath);
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
    return true;
  });

  ipcMain.handle("backup:forget", function () {
    try {
      fs.unlinkSync(configPath());
    } catch (e) {}
    return true;
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 720,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    icon: ICON_ICO,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setIcon(appIcon());
  win.loadURL(APP_URL);
  win.once("ready-to-show", function () { win.show(); });
  win.on("close", function (ev) {
    if (quitting) return;
    ev.preventDefault();
    win.hide();
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", showWindow);
  app.whenReady().then(function () {
    ensureDefaultBackupConfig();
    registerBackupIpc();
    buildTray();
    createWindow();
  });
  app.on("window-all-closed", function (ev) {
    ev.preventDefault();
  });
  app.on("before-quit", function () { quitting = true; });
}
