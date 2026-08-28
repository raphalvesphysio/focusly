const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("focuslyDesktop", {
  tray: true,
  backup: {
    isAvailable: function () {
      return true;
    },
    getConfig: function () {
      return ipcRenderer.invoke("backup:getConfig");
    },
    chooseFolder: function () {
      return ipcRenderer.invoke("backup:chooseFolder");
    },
    read: function () {
      return ipcRenderer.invoke("backup:read");
    },
    write: function (state) {
      return ipcRenderer.invoke("backup:write", state);
    },
    forget: function () {
      return ipcRenderer.invoke("backup:forget");
    },
  },
});
