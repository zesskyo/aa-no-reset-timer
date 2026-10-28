// What the settings page can ask the app for (window.aaApp): keeping the splits on top, and updates
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("aaApp", {
  version: ipcRenderer.sendSync("aa-version"),
  getOnTop: () => ipcRenderer.invoke("aa-on-top"),
  setOnTop: v => ipcRenderer.invoke("aa-set-on-top", !!v),
  checkUpdate: () => ipcRenderer.invoke("aa-check-update"),
  onUpdate: f => { ipcRenderer.on("aa-update", (e, t) => f(String(t))); ipcRenderer.invoke("aa-update-text").then(t => { if (t) f(String(t)); }); },
});
