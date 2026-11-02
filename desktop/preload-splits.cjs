// What the splits page can ask the app for (window.aaWin): moving the window by dragging it, when it has no title bar
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("aaWin", {
  frameless: ipcRenderer.sendSync("aa-frameless"),
  drag: on => ipcRenderer.send("aa-drag", !!on),
});
