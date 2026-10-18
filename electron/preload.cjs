// Preload: stellt der Oberfläche nur die Update-Brücke window.appUpdate bereit.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appUpdate", {
  getStatus: () => ipcRenderer.invoke("update:get-status"),
  check: () => ipcRenderer.invoke("update:check"),
  install: () => ipcRenderer.invoke("update:install"),
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("update:status", listener);
    return () => ipcRenderer.removeListener("update:status", listener);
  },
});
