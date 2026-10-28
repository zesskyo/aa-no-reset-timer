// AA Live as a desktop app: the timer (app/aa-live.mjs, run in the background by the app's own Node), its splits in a
// window of their own (nothing on them to click: a window capture shows just the splits), and the settings in another
// (right-click the splits, or Esc). OBS and phones still use the page's link, as before.
const { app, BrowserWindow, dialog, shell, Menu, ipcMain } = require("electron");
const { spawn, execFileSync } = require("node:child_process");
const os = require("node:os");
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

let win = null, settingsWin = null, server = null, quitting = false, updateText = "";
const logFile = () => path.join(app.getPath("userData"), "aa-live.log");
// the app's own settings (the window: its size and place, on top)
const prefsFile = () => path.join(app.getPath("userData"), "window.json");
const prefs = (() => { try { return JSON.parse(fs.readFileSync(prefsFile(), "utf8")); } catch { return {}; } })();
const savePrefs = () => { try { fs.writeFileSync(prefsFile(), JSON.stringify(prefs)); } catch {} };

// the timer: packed next to the app (resources/aa-live.mjs), or the repository's app/ while working on it
function startServer() {
  const file = app.isPackaged ? path.join(process.resourcesPath, "aa-live.mjs") : path.join(__dirname, "..", "app", "aa-live.mjs");
  fs.mkdirSync(app.getPath("userData"), {recursive: true});
  const out = fs.createWriteStream(logFile());
  // (the app updates itself through its releases, not by downloading the timer's file)
  server = spawn(process.execPath, [file, "--no-open", "--no-update", "--port", String(PORT)], {env: {...process.env, ELECTRON_RUN_AS_NODE: "1"}, windowsHide: true});
  server.stdout.pipe(out); server.stderr.pipe(out);
  server.on("exit", () => {
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
// (is a stats site set? If not, the settings open the first time)
const getState = () => new Promise(ok => http.get(LINK + "state.json", res => { let b = ""; res.on("data", c => b += c); res.on("end", () => { try { ok(JSON.parse(b)); } catch { ok(null); } }); }).on("error", () => ok(null)));

const safeWeb = w => {
  // (links on the pages, like the stats site's: in the browser)
  w.webContents.setWindowOpenHandler(({url}) => { shell.openExternal(url); return {action: "deny"}; });
  w.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(LINK)) { e.preventDefault(); shell.openExternal(url); } });
};
// Esc on the splits: the settings
const shortcut = w => w.webContents.on("before-input-event", (e, input) => { if (input.type === "keyDown" && input.key === "Escape" && !input.control && !input.meta && !input.alt && !input.shift) { e.preventDefault(); openSettings(); } });

function openWindow() {
  const b = prefs.bounds || {};
  win = new BrowserWindow({width: b.width || 470, height: b.height || 860, x: b.x, y: b.y, minWidth: 300, minHeight: 200, title: "AA Live", backgroundColor: "#000000",
    autoHideMenuBar: true, show: false, alwaysOnTop: !!prefs.onTop, icon: path.join(__dirname, "icon.png"), webPreferences: {contextIsolation: true, sandbox: true}});
  win.removeMenu();
  safeWeb(win); shortcut(win);
  // right-click: the settings, on top, quit
  win.webContents.on("context-menu", () => Menu.buildFromTemplate([
    {label: "Settings…", accelerator: "Escape", click: openSettings},
    {label: "Keep on top", type: "checkbox", checked: win.isAlwaysOnTop(), click: m => setOnTop(m.checked)},
    {type: "separator"},
    {label: "Quit AA Live", click: () => app.quit()},
  ]).popup({window: win}));
  win.once("ready-to-show", () => win.show());
  // (for testing: a picture of the window, then quit)
  if (process.env.AA_LIVE_SHOT) win.webContents.once("did-finish-load", () => setTimeout(async () => {
    fs.writeFileSync(process.env.AA_LIVE_SHOT, (await win.webContents.capturePage()).toPNG());
    if (settingsWin) fs.writeFileSync(process.env.AA_LIVE_SHOT.replace(/\.png$/, "-settings.png"), (await settingsWin.webContents.capturePage()).toPNG());
    app.quit();
  }, 4000));
  const keep = () => { if (win && !win.isMinimized()) { prefs.bounds = win.getBounds(); savePrefs(); } };
  win.on("resized", keep); win.on("moved", keep);
  win.on("closed", () => { win = null; if (settingsWin) settingsWin.close(); });
  win.loadURL(LINK + "?app=1");
}

function openSettings() {
  if (settingsWin) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({width: 620, height: 820, minWidth: 460, title: "AA Live settings", backgroundColor: "#0b0c0f", autoHideMenuBar: true, show: false,
    icon: path.join(__dirname, "icon.png"), webPreferences: {contextIsolation: true, sandbox: true, preload: path.join(__dirname, "preload.cjs")}});
  settingsWin.removeMenu();
  safeWeb(settingsWin);
  // (the bug report: saved where the person picks)
  settingsWin.webContents.session.on("will-download", (e, item) => { item.setSaveDialogOptions({defaultPath: path.join(app.getPath("downloads"), item.getFilename())}); });
  settingsWin.once("ready-to-show", () => settingsWin.show());
  settingsWin.on("closed", () => { settingsWin = null; });
  settingsWin.loadURL(LINK + "settings");
}

function setOnTop(v) { prefs.onTop = !!v; savePrefs(); if (win) win.setAlwaysOnTop(!!v); }
const tellUpdate = t => { updateText = t; if (settingsWin) settingsWin.webContents.send("aa-update", t); };

// Updating, by itself: the new version downloaded in the background, then put in place when AA Live restarts (now, or
// the next time it's closed), with nothing to install by hand.
// - Windows and Linux: electron-updater (the installer runs silently, without its windows)
// - Mac: an app that isn't signed can't use that, so its own way: the new version's .zip downloaded and unpacked here,
//   and a little script that waits for AA Live to close puts it in place of this one (and opens it again)
const restartNow = async version => {
  const r = await dialog.showMessageBox(win, {type: "info", message: `AA Live ${version} is ready.`, detail: "Restart now to use it, or it's put in place the next time AA Live closes.", buttons: ["Restart now", "Later"], defaultId: 0, cancelId: 1});
  return r.response === 0;
};
let updater = null;
try { if (app.isPackaged && process.platform !== "darwin") updater = require("electron-updater").autoUpdater; } catch {}
if (updater) {
  updater.autoDownload = true; updater.autoInstallOnAppQuit = true;
  updater.on("checking-for-update", () => tellUpdate("Looking for a new version…"));
  updater.on("update-not-available", () => tellUpdate("Up to date"));
  updater.on("download-progress", p => tellUpdate(`Downloading the new version… ${Math.round(p.percent)}%`));
  updater.on("error", e => tellUpdate("Couldn't update: " + (e && e.message ? e.message.split("\n")[0] : e)));
  updater.on("update-downloaded", async info => {
    tellUpdate(`AA Live ${info.version} is ready: it's put in place when AA Live closes`);
    if (await restartNow(info.version)) { quitting = true; if (server) server.kill(); updater.quitAndInstall(true, true); }   // (silently, and open again)
  });
}

// (the Mac's): the .app this is, if it can be replaced (not run from the .dmg, or from where macOS moved it to check it)
const macApp = () => {
  const p = process.execPath.split("/Contents/MacOS/")[0];
  if (!app.isPackaged || !p.endsWith(".app") || p.includes("/AppTranslocation/") || p.startsWith("/Volumes/")) return null;
  try { fs.accessSync(path.dirname(p), fs.constants.W_OK); fs.accessSync(p, fs.constants.W_OK); return p; } catch { return null; }
};
let macReady = null;   // {from: the new AA Live.app, to: this one}
async function macDownload(version, asset) {
  const to = macApp(); if (!to || !asset) return false;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-live-update-")), file = path.join(dir, asset.name);
  const res = await fetch(asset.browser_download_url, {headers: {"User-Agent": "AA-Live"}});
  if (!res.ok || !res.body) throw new Error("download: " + res.status);
  const total = +res.headers.get("content-length") || asset.size || 0, out = fs.createWriteStream(file);
  let got = 0, shown = -1;
  for await (const chunk of res.body) {
    if (!out.write(chunk)) await new Promise(r => out.once("drain", r));
    got += chunk.length;
    const pc = total ? Math.floor(got / total * 100) : 0; if (pc !== shown) { shown = pc; tellUpdate(`Downloading the new version… ${pc}%`); }
  }
  await new Promise((ok, bad) => out.end(e => e ? bad(e) : ok()));
  execFileSync("/usr/bin/ditto", ["-x", "-k", file, dir]);
  const from = fs.readdirSync(dir).filter(f => f.endsWith(".app")).map(f => path.join(dir, f))[0];
  if (!from) throw new Error("no app in " + asset.name);
  try { execFileSync("/usr/bin/xattr", ["-cr", from]); } catch {}
  macReady = {from, to};
  return true;
}
function macInstall(reopen) {
  if (!macReady) return;
  const {from, to} = macReady; macReady = null;
  // (waits for this AA Live to be closed, swaps the apps, puts the old one back if that didn't work)
  const script = `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.2; done
rm -rf "$2.old"
if mv "$2" "$2.old" && mv "$1" "$2"; then rm -rf "$2.old"; xattr -cr "$2" 2>/dev/null; else [ -d "$2" ] || mv "$2.old" "$2"; fi
${reopen ? 'open "$2"' : ""}`;
  spawn("/bin/sh", ["-c", script, "aa-live-update", from, to], {detached: true, stdio: "ignore"}).unref();
}

const newer = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
let checking = false;
async function checkUpdate() {
  if (updater) { try { await updater.checkForUpdates(); } catch {} return; }
  if (checking || macReady) return; checking = true;
  try {
    tellUpdate("Looking for a new version…");
    const res = await fetch("https://api.github.com/repos/zesskyo/aa-no-reset-timer/releases/latest", {headers: {"User-Agent": "AA-Live"}});
    if (!res.ok) return tellUpdate("Couldn't check for updates");
    const rel = await res.json(), latest = String(rel.tag_name || "").replace(/^v/, "");
    if (!latest || !newer(latest, app.getVersion())) return tellUpdate("Up to date");
    const zip = (rel.assets || []).find(a => /-mac\.zip$/.test(a.name));
    let ready = false;
    try { ready = process.platform === "darwin" && await macDownload(latest, zip); } catch (e) { tellUpdate("Couldn't download the new version: " + (e.message || e)); }
    if (ready) {
      tellUpdate(`AA Live ${latest} is ready: it's put in place when AA Live closes`);
      if (await restartNow(latest)) { macInstall(true); app.quit(); }
      return;
    }
    // (where it can't be replaced, like run from the .dmg: the link)
    tellUpdate(`AA Live ${latest} is out (you have ${app.getVersion()})`);
    const r = await dialog.showMessageBox(win, {type: "info", message: `AA Live ${latest} is out (you have ${app.getVersion()}).`,
      detail: process.platform === "darwin" ? "To have it update itself from now on, put AA Live in your Applications folder and open it from there." : "", buttons: ["Download", "Later"], defaultId: 0, cancelId: 1});
    if (r.response === 0) shell.openExternal(RELEASES + "/latest");
  } catch { tellUpdate("Couldn't check for updates"); }
  finally { checking = false; }
}

// for the settings page (preload.cjs)
ipcMain.handle("aa-on-top", () => !!prefs.onTop);
ipcMain.handle("aa-set-on-top", (e, v) => setOnTop(v));
ipcMain.handle("aa-check-update", () => checkUpdate());
ipcMain.handle("aa-update-text", () => updateText);
ipcMain.on("aa-version", e => { e.returnValue = app.getVersion(); });

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } else openWindow(); });
app.whenReady().then(async () => {
  // (a Mac has its menu bar: the settings are in it too)
  Menu.setApplicationMenu(process.platform === "darwin" ? Menu.buildFromTemplate([{label: "AA Live", submenu: [{role: "about"}, {label: "Settings…", click: openSettings}, {type: "separator"}, {role: "quit"}]}, {role: "editMenu"}]) : null);
  startServer();
  try { await whenUp(); } catch { if (!quitting) dialog.showErrorBox("AA Live", "The timer didn't start. Its log: " + logFile()); app.quit(); return; }
  openWindow();
  // (the first time, with no stats site set: the settings too)
  const st = await getState();
  if (!prefs.seenSettings && st && !st.siteUrl) { prefs.seenSettings = true; savePrefs(); openSettings(); }
  setTimeout(checkUpdate, 5000); setInterval(checkUpdate, 6 * 3600000);   // (and while it's left open)
});
// (the timer stops with the app: OBS's source goes blank until it's opened again)
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => { quitting = true; if (server) server.kill(); macInstall(false); });   // (a new version ready: put in place)
