// AA Live as a desktop app: the timer (app/aa-live.mjs, run in the background by the app's own Node) and its page in a
// window of its own. OBS and phones still use the page's link, as before.
const { app, BrowserWindow, dialog, shell, Menu } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");

const PORT = 7476;
const LINK = `http://localhost:${PORT}/`;
const RELEASES = "https://github.com/zesskyo/aa-no-reset-timer/releases";

// (the window's own files, apart from the timer's settings and runs in "AA Live")
app.setPath("userData", path.join(app.getPath("appData"), "AA Live", "app"));

// one at a time (a second start just brings the window back)
if (!app.requestSingleInstanceLock()) app.quit();

let win = null, server = null, quitting = false;
const logFile = () => path.join(app.getPath("userData"), "aa-live.log");

// the timer: packed next to the app (resources/aa-live.mjs), or the repository's app/ while working on it
function startServer() {
  const file = app.isPackaged ? path.join(process.resourcesPath, "aa-live.mjs") : path.join(__dirname, "..", "app", "aa-live.mjs");
  fs.mkdirSync(app.getPath("userData"), {recursive: true});
  const out = fs.createWriteStream(logFile());
  // (the app updates itself through its releases, not by downloading the timer's file)
  server = spawn(process.execPath, [file, "--no-open", "--no-update", "--port", String(PORT)], {env: {...process.env, ELECTRON_RUN_AS_NODE: "1"}, windowsHide: true});
  server.stdout.pipe(out); server.stderr.pipe(out);
  server.on("exit", code => {
    server = null;
    if (quitting) return;
    const log = (() => { try { return fs.readFileSync(logFile(), "utf8").trim().split("\n").slice(-6).join("\n"); } catch { return ""; } })();
    dialog.showErrorBox("AA Live stopped", (/in use/.test(log) ? "Something else is using port " + PORT + ": is AA Live already running, from its old Start AA Live file?\n\n" : "")
      + log + "\n\n(the whole log: " + logFile() + ")");
    app.quit();
  });
}

// the page, once the timer answers
function whenUp(tries = 100) {
  return new Promise((ok, bad) => {
    const go = n => http.get(LINK + "state.json", res => { res.resume(); ok(); }).on("error", () => n ? setTimeout(() => go(n - 1), 150) : bad(new Error("no answer")));
    go(tries);
  });
}

function openWindow() {
  win = new BrowserWindow({width: 470, height: 860, minWidth: 360, title: "AA Live", backgroundColor: "#000000", autoHideMenuBar: true, show: false,
    icon: path.join(__dirname, "icon.png"), webPreferences: {contextIsolation: true, sandbox: true}});
  win.removeMenu();
  // (links on the page, like the stats site's: in the browser)
  win.webContents.setWindowOpenHandler(({url}) => { shell.openExternal(url); return {action: "deny"}; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(LINK)) { e.preventDefault(); shell.openExternal(url); } });
  win.once("ready-to-show", () => win.show());
  // (for testing: a picture of the window, then quit)
  if (process.env.AA_LIVE_SHOT) win.webContents.once("did-finish-load", () => setTimeout(async () => { fs.writeFileSync(process.env.AA_LIVE_SHOT, (await win.webContents.capturePage()).toPNG()); app.quit(); }, 3000));
  win.on("closed", () => { win = null; });
  win.loadURL(LINK);
}

// a newer version out: say so once, with the link (the releases page has the installers)
async function checkUpdate() {
  try {
    const res = await fetch("https://api.github.com/repos/zesskyo/aa-no-reset-timer/releases/latest", {headers: {"User-Agent": "AA-Live"}});
    if (!res.ok) return;
    const latest = String((await res.json()).tag_name || "").replace(/^v/, "");
    const newer = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
    if (latest && newer(latest, app.getVersion())) {
      const r = await dialog.showMessageBox(win, {type: "info", message: `AA Live ${latest} is out (you have ${app.getVersion()}).`, buttons: ["Download", "Later"], defaultId: 0, cancelId: 1});
      if (r.response === 0) shell.openExternal(RELEASES + "/latest");
    }
  } catch {}
}

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } else openWindow(); });
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  startServer();
  try { await whenUp(); } catch { if (!quitting) dialog.showErrorBox("AA Live", "The timer didn't start. Its log: " + logFile()); app.quit(); return; }
  openWindow();
  setTimeout(checkUpdate, 5000);
});
// (the timer stops with the app: OBS's source goes blank until it's opened again)
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => { quitting = true; if (server) server.kill(); });
