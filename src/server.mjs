/*
 * AA Live — a live splitter for AA No Reset (1.16.1) runs, read from Hermes.
 *
 * Finds the Minecraft instance Hermes is running in, follows the world's live play log as it's written, works out the
 * splits the same way the stats site does (the site's own code is inside this file), and compares them with earlier
 * runs: those of a stats site (an aa-stats site, if one's set), and those finished with AA Live (kept in its folder).
 * The splits are shown on a page served here: open it in a browser, or add it to OBS as a browser source.
 *
 * The page can also be opened on a phone on the same Wi-Fi (the links are printed when it starts).
 *
 * --replay plays back a run that's already done instead (a run number from the stats site, or a play.log), with a slider
 * on the page to go to any point in it: to see how the splits behave.
 *
 * Usage: node aa-live.mjs [--site <stats site link>] [--port 7476] [--world <world folder>] [--no-open] [--local-only]
 *                         [--replay <run number or play.log>]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { rotate } from "./rotator.mjs";

// (gen.mjs puts these in)
const SITE_CODE = /*SITE_CODE*/"";
const GHOST = new Function(/*GHOST_CODE*/"")();
const PAGE = /*PAGE*/"";
const SETTINGS_PAGE = /*SETTINGS_PAGE*/"";   // (the settings, at /settings: see src/settings.html)
const ITEM_ICONS = /*ITEM_ICONS*/{};   // the sub-splits' and the Midgame checklist's icons (see build.mjs)
const BASE_ICONS = /*BASE_ICONS*/{};   // the splits' own icons, for when there's no stats site to take them from
const VERSION = "1.0";
const BUILD = /*BUILD*/0;   // when this file was built (build.mjs): a newer one has a bigger number

// ---------- Settings ----------
const args = process.argv.slice(2);

// ---------- Updating itself ----------
// All of AA Live is this one file: when it starts, it looks for a newer one on GitHub, and if there is one, puts it in
// place of itself and starts again (--no-update: not). While it runs, it only looks (every 6 hours) and says so on the
// page: it never changes in the middle of a run.
const UPDATE_URL = process.env.AA_LIVE_UPDATE_URL || "https://raw.githubusercontent.com/zesskyo/aa-no-reset-timer/main/app/aa-live.mjs";   // (the variable: for testing)
const SELF = fileURLToPath(import.meta.url);
let updateReady = false;
async function newerBuild() {
  if (!BUILD || args.includes("--no-update")) return null;   // (BUILD 0: not a built file, src/server.mjs itself)
  try {
    const res = await fetch(UPDATE_URL, {signal: AbortSignal.timeout(8000), headers: {"cache-control": "no-cache"}});
    if (!res.ok) return null;
    const text = await res.text(), m = /\nconst BUILD = (\d+);/.exec(text);
    return m && +m[1] > BUILD && text.includes("// ---------- Updating itself ----------") ? text : null;
  } catch { return null; }
}
if (process.env.AA_LIVE_UPDATED !== "1") {
  const text = await newerBuild();
  if (text) {
    try {
      fs.writeFileSync(SELF + ".new", text); fs.renameSync(SELF + ".new", SELF);
      console.log("AA Live was updated: starting the new version…");
      const child = spawn(process.execPath, [SELF, ...args], {stdio: "inherit", env: {...process.env, AA_LIVE_UPDATED: "1"}});
      child.on("exit", code => process.exit(code ?? 0));
      await new Promise(() => {});   // (this one waits for the new one)
    } catch (e) { console.log("Couldn't update AA Live (" + e.message + "): carrying on with this version"); }
  }
}
setInterval(async () => { if (!updateReady && await newerBuild()) { updateReady = true; console.log("A new version of AA Live is out: it updates the next time you start it."); } }, 6 * 3600000);
const opt = name => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : undefined; };
const PORT = Number(opt("port") || 7476);
// ---------- On a phone on the same Wi-Fi ----------
// The page is served to the whole network (unless --local-only), at this computer's addresses there: Wi-Fi's first
// (en0 on a Mac), and not ones a phone can't reach (VPNs, virtual machines, Docker, self-assigned 169.254.x.x ones).
const LAN = !args.includes("--local-only");
const lanLinks = () => {
  if (!LAN) return [];
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces()))
    for (const a of list || []) {
      if (a.family !== "IPv4" || a.internal || a.address.startsWith("169.254.")) continue;
      if (/^(utun|tun|tap|bridge|docker|veth|vboxnet|vmnet|awdl|llw|lo|gif|stf|anpi|ap\d)/i.test(name)) continue;
      out.push({name, url: `http://${a.address}:${PORT}/`, wifi: /^(en0|wl|wlan|wi-?fi)/i.test(name)});
    }
  return out.sort((a, b) => b.wifi - a.wifi);
};
// The macOS firewall: if it's on and blocking node, a phone can't connect. What it says, and how to let node through.
function checkFirewall() {
  if (!LAN || process.platform !== "darwin") return;
  const fw = "/usr/libexec/ApplicationFirewall/socketfilterfw";
  execFile(fw, ["--getglobalstate"], (e, out) => {
    if (e || !/enabled/i.test(out) || /disabled/i.test(out)) return;
    execFile(fw, ["--getblockall"], (e2, all) => {
      if (!e2 && /enabled|block all/i.test(all) && !/disabled/i.test(all)) console.log("  The macOS firewall blocks all incoming connections, so a phone can't connect. Turn off \"Block all incoming connections\" in System Settings › Network › Firewall › Options.");
    });
    execFile(fw, ["--getappblocked", process.execPath], (e3, app) => {
      const blocked = !e3 && /block/i.test(app) && !/permitted|allowed/i.test(app);
      console.log(blocked
        ? `  The macOS firewall is blocking node, so a phone can't connect. To allow it, paste this in Terminal (it asks for your password):\n    sudo ${fw} --add "${process.execPath}" --unblockapp "${process.execPath}"`
        : `  (The macOS firewall is on. If your phone can't connect, allow "node" in System Settings › Network › Firewall › Options, or paste in Terminal:\n    sudo ${fw} --add "${process.execPath}" --unblockapp "${process.execPath}")`);
    });
  });
}
// (each device that opens the page from the network is shown once, so it's clear whether the phone gets here at all)
const seenDevices = new Set();
const WORLD = opt("world") ? path.resolve(opt("world")) : null;
const home = os.homedir();
// where Hermes keeps its list of running games (the same places as HermesCore.getGlobalPath)
const HERMES_GLOBAL = process.platform === "darwin" ? path.join(home, "Library", "Application Support", "MCSRHermes")
  : process.platform === "win32" ? path.join(process.env.LOCALAPPDATA || process.env.APPDATA || home, "MCSRHermes")
  : process.env.XDG_RUNTIME_DIR ? path.join(process.env.XDG_RUNTIME_DIR, "MCSRHermes") : path.join(home, ".local", "share", "MCSRHermes");
// this program's own folder: its settings, the runs finished with it (runs/), and the last stats site download (for
// when there's no internet)
const OWN = process.platform === "darwin" ? path.join(home, "Library", "Application Support", "AA Live")
  : process.platform === "win32" ? path.join(process.env.APPDATA || home, "AA Live") : path.join(home, ".aa-live");
fs.mkdirSync(path.join(OWN, "runs"), {recursive: true});
const ownFile = f => path.join(OWN, f);
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
// the settings, changed in the settings page (or --site): the stats site to compare with, if any
const settings = readJson(ownFile("settings.json")) || {};
let SITE = opt("site") ?? settings.site ?? "";
// how the splits look (the settings page; a link's ?comp=, ?ms=… still win): what they compare with, the decimals, how
// many rows, the size, the background
const DISPLAY_DEFAULTS = {comp: "auto", ms: 3, rows: 8, scale: 1, bg: null, clock: "h"};
const display = () => { const d = {...DISPLAY_DEFAULTS, ...(settings.display || {})}; d.clock = {full: "h", short: "s"}[d.clock] || d.clock; return d; };
// (the last few hundred lines it's printed, for a bug report: /report.txt)
const logLines = [];
const log = (...m) => { const l = [new Date().toLocaleTimeString(), ...m].join(" "); logLines.push(l); if (logLines.length > 400) logLines.shift(); console.log(l); };

// ---------- The stats site's code and runs ----------
let site = null;   // {api, comps, icons, title, runs, fetchedAt}
let siteData = {runs: []}, siteAt = null;   // (the last stats site download, to add new runs of our own to)
// The runs finished with AA Live (runs/ in its folder), and those of the stats site (if there's one); a run on both
// counts once. Ours are numbered after the site's.
// (the same world: the same player and the same first advancements, to the millisecond. Not its start: that's when the
// world was last opened, so it moves when the world is opened again after the run, e.g. for /seed)
const worldOf = r => r.player + "|" + (r.events || []).slice(0, 5).map(e => Array.isArray(e) ? e.join("|") : e).join(",");
const sameRun = (a, b) => a.player === b.player && (a.start === b.start || worldOf(a) === worldOf(b));
function localRuns(siteRuns) {
  const has = new Set(siteRuns.map(r => r.start + "|" + r.player)), worlds = new Set(siteRuns.map(worldOf));
  let num = Math.max(0, ...siteRuns.map(r => (r.meta && r.meta.num) || 0));
  const out = [];
  // (the latest copy of each world: one saved again after it was opened again)
  const files = fs.readdirSync(path.join(OWN, "runs")).filter(f => f.endsWith(".json")).map(f => readJson(path.join(OWN, "runs", f))).filter(r => r && r.events);
  for (const r of files.sort((a, b) => b.start - a.start)) if (!has.has(r.start + "|" + r.player) && !worlds.has(worldOf(r))) { out.push(r); worlds.add(worldOf(r)); }
  return out.sort((a, b) => a.start - b.start).map(r => ({...r, meta: {...(r.meta || {}), num: ++num, local: true}}));
}
function loadSite(data, fetchedAt) {
  siteData = data; siteAt = fetchedAt;
  const siteRuns = data.runs || [], mine = localRuns(siteRuns);
  // (with every advancement's icon, "adv:<id>": a run's last advancement's is Post-endgame's)
  const advIcons = Object.fromEntries(Object.entries(ITEM_ICONS).filter(([k]) => k.startsWith("adv:")));
  data = {...data, runs: [...siteRuns, ...mine], icons: {...BASE_ICONS, ...advIcons, ...(data.icons || {})}};
  const document = {getElementById: () => ({textContent: JSON.stringify(data)})};
  const api = new Function("document", SITE_CODE + "\nreturn {parseLog, logReader, fixTimerResets, derive, validRuns, pbRun, RUNS, runNum, WR, SPLITS, TOP, ADV, ICONS, LAST_ICON, FALLBACK_LAST_ICON, VVF, T, encodeRun, runKey};")(document);
  const valid = api.validRuns(), n = api.SPLITS.length, POST = n - 1;
  const durs = r => api.derive(r).splits.map((s, i) => s.dur ?? (i === POST ? 0 : null));   // (most runs have no Post-endgame)
  const all = valid.map(durs);
  const col = i => all.map(d => d[i]).filter(v => v != null);
  const pb = api.pbRun(), wr = api.WR && api.WR.finalIgt != null ? api.WR : null;
  const finals = valid.map(r => r.finalIgt);
  const comps = {
    pb: pb ? {name: "Personal Best", short: "PB", splits: durs(pb), final: pb.finalIgt} : null,
    avg: all.length ? {name: "Average", short: "Average", splits: [...Array(n)].map((_, i) => { const c = col(i); return c.length ? c.reduce((a, b) => a + b, 0) / c.length : null; }), final: finals.reduce((a, b) => a + b, 0) / finals.length} : null,
    best: all.length ? {name: "Best Segments", short: "Best", splits: [...Array(n)].map((_, i) => { const c = col(i); return c.length ? Math.min(...c) : null; })} : null,
    worst: all.length ? {name: "Worst Segments", short: "Worst", splits: [...Array(n)].map((_, i) => { const c = col(i); return c.length ? Math.max(...c) : null; }), final: Math.max(...finals)} : null,
    wr: wr ? {name: "World Record" + (wr.meta && wr.meta.runner ? " · " + wr.meta.runner : ""), short: "WR", splits: durs(wr), final: wr.finalIgt} : null,
  };
  if (comps.best) { comps.best.final = comps.best.splits.reduce((a, b) => a + (b || 0), 0); comps.best.name = "Sum of Best"; }
  // the main splits (TOP: Earlygame, Midgame, Endgame, Post-endgame), which the page lists: each comparison's time for
  // each (tsplits) and when each ended (tends); for average, best and worst, added up
  const nt = api.TOP.length, tdurs = r => api.derive(r).top.map((t, k) => t.dur ?? (k === nt - 1 ? 0 : null));
  const tall = valid.map(tdurs), tagg = f => [...Array(nt)].map((_, k) => { const c = tall.map(x => x[k]).filter(v => v != null); return c.length ? f(c) : null; });
  const tsum = d => { let t = 0; return d.map(v => t += v || 0); };
  for (const [k, r] of [["pb", pb], ["wr", wr]]) if (comps[k]) { comps[k].tsplits = tdurs(r); comps[k].tends = api.derive(r).top.map(t => t.end); }
  for (const [k, f] of [["avg", c => c.reduce((a, b) => a + b, 0) / c.length], ["best", c => Math.min(...c)], ["worst", c => Math.max(...c)]])
    if (comps[k]) { comps[k].tsplits = tagg(f); comps[k].tends = tsum(comps[k].tsplits); }
  // for the pace: each split's (and step's) time in every run (a split a run didn't have: no time; see the page)
  const ds = valid.map(r => api.derive(r));
  if (ds.length) comps.pace = {
    splits: api.SPLITS.map((_, i) => ds.map(d => d.splits[i].dur ?? 0)),
    subs: api.SPLITS.map((_, i) => { const n = Math.max(0, ...ds.map(d => d.splits[i].subs ? d.splits[i].subs.length : 0));
      return n ? [...Array(n)].map((_, j) => ds.map(d => d.splits[i].subs && d.splits[i].subs[j] ? d.splits[i].subs[j].dur : null).filter(x => x != null)) : null; }),
  };
  // each comparison's split times (the time each split ended at): a real run's own (a split it didn't have ends where the
  // one before did); for average, best and worst, the segments added up, as LiveSplit does
  const endsOf = r => { let t = 0; return api.derive(r).splits.map(s => t = s.end ?? t); };
  const sums = d => { let t = 0; return d.map(v => t += v || 0); };
  if (comps.pb) comps.pb.ends = endsOf(pb);
  if (comps.wr) comps.wr.ends = endsOf(wr);
  for (const k of ["avg", "best", "worst"]) if (comps[k]) comps[k].ends = sums(comps[k].splits);
  // sub-splits: each comparison's time for each step, as a split time. A real run's own; for average, best and worst,
  // the time into the split (the average, fastest or slowest of the runs that did that step) after the comparison's
  // split start
  const subsOf = r => api.derive(r).splits.map(s => s.subs ? s.subs.map(x => x.t) : null);
  if (comps.pb) comps.pb.subs = subsOf(pb);
  if (comps.wr) comps.wr.subs = subsOf(wr);
  const into = valid.map(r => api.derive(r).splits.map(s => s.subs ? s.subs.map(x => x.t == null ? null : x.t - s.start) : null));
  const pick = {avg: xs => xs.reduce((a, b) => a + b, 0) / xs.length, best: xs => Math.min(...xs), worst: xs => Math.max(...xs)};
  for (const k of ["avg", "best", "worst"]) if (comps[k]) comps[k].subs = api.SPLITS.map((_, i) => {
    const counts = Math.max(0, ...into.map(x => x[i] ? x[i].length : 0));
    if (!counts) return null;
    return [...Array(counts)].map((_, j) => { const xs = into.map(x => x[i] && x[i][j]).filter(v => v != null); return xs.length ? (i ? comps[k].ends[i - 1] : 0) + pick[k](xs) : null; });
  });
  // the Midgame checklist's splits: how long each took (time in its area), for the runs that finished it
  const midOf = r => { const m = api.derive(r).splits[3].mid; const o = {}; if (m) for (const x of m.sections) if (x.split && x.complete) o[x.key] = x.dur; return o; };
  if (comps.pb) comps.pb.mid = midOf(pb);
  if (comps.wr) comps.wr.mid = midOf(wr);
  const allMid = valid.map(midOf);
  for (const k of ["avg", "best", "worst"]) if (comps[k]) { comps[k].mid = {}; for (const key of new Set(allMid.flatMap(o => Object.keys(o)))) { const xs = allMid.map(o => o[key]).filter(v => v != null); comps[k].mid[key] = pick[k](xs); } }
  // how long each step took: a real run's own; the average, fastest (gold) and slowest of all the runs
  const durOf = r => api.derive(r).splits.map(s => s.subs ? s.subs.map(x => x.dur) : null);
  if (comps.pb) comps.pb.subDurs = durOf(pb);
  if (comps.wr) comps.wr.subDurs = durOf(wr);
  const allDurs = valid.map(durOf);
  for (const k of ["avg", "best", "worst"]) if (comps[k]) comps[k].subDurs = api.SPLITS.map((_, i) => {
    const n = Math.max(0, ...allDurs.map(x => x[i] ? x[i].length : 0));
    return n ? [...Array(n)].map((_, j) => { const xs = allDurs.map(x => x[i] && x[i][j]).filter(v => v != null); return xs.length ? pick[k](xs) : null; }) : null;
  });
  // icons the page needs: the splits', and every possible last-advancement icon (for Post-endgame)
  const icons = {};
  for (const k of [...api.SPLITS.map(s => s.icon), ...api.TOP.map(t => t.icon), ...Object.values(api.LAST_ICON || {}), api.FALLBACK_LAST_ICON]) if (k && api.ICONS[k]) icons[k] = api.ICONS[k];
  // (not every advancement's: only those the run needs are sent with it, see compute)
  for (const [k, v] of Object.entries(ITEM_ICONS)) if (!k.startsWith("adv:")) icons[k] = v;
  // the run number for a new run: one after the site's last
  const nextNum = Math.max(0, ...api.RUNS.map(r => api.runNum(r))) + 1;
  site = {api, comps, icons, nextNum, title: (data.text && data.text.siteTitle) || "AA No Reset", runs: valid.length, fetchedAt, url: SITE};
  log(`Runs to compare with: ${valid.length}` + (mine.length ? ` (${mine.length} finished with AA Live)` : "") + (pb ? `, PB ${fmt(pb.finalIgt)}` : "") + (wr ? `, WR ${fmt(wr.finalIgt)}` : ""));
}

async function fetchSite() {
  if (!SITE) { loadSite({runs: []}, null); update(); return; }   // (no stats site: just the runs finished with AA Live)
  try {
    let html;
    if (/^https?:\/\//i.test(SITE)) {
      const res = await fetch(SITE.replace(/\/?$/, m => SITE.endsWith(".html") ? "" : "/"), {headers: {"cache-control": "no-cache"}});
      if (!res.ok) throw new Error("HTTP " + res.status);
      html = await res.text();
    } else html = fs.readFileSync(path.resolve(SITE.replace(/^~(?=\/)/, home)), "utf8");
    const m = /<script type="application\/json" id="aa-data">([\s\S]*?)<\/script>/.exec(html);
    if (!m) throw new Error("that page isn't a stats site (no runs in it)");
    const data = JSON.parse(m[1]);
    fs.writeFileSync(ownFile("site-cache.json"), JSON.stringify({site: SITE, fetchedAt: Date.now(), data}));
    loadSite(data, Date.now());
  } catch (e) {
    log(`Couldn't load the stats site (${e.message})`);
    if (!site) {
      const c = readJson(ownFile("site-cache.json"));
      if (c && c.site === SITE) { loadSite(c.data, c.fetchedAt); log("Using the copy from " + new Date(c.fetchedAt).toLocaleString()); }
      else loadSite({runs: []}, null);
    }
  }
  update();
}

// ---------- Finding the world ----------
// The world being played (or the last one played), from Hermes' files in the game folder
function findWorld() {
  if (WORLD) return WORLD;
  const games = new Set();
  try {
    for (const f of fs.readdirSync(path.join(HERMES_GLOBAL, "instances"))) {
      const j = f.endsWith(".json") && readJson(path.join(HERMES_GLOBAL, "instances", f));
      if (j && j.game_dir) games.add(j.game_dir);
    }
  } catch {}
  const last = readJson(ownFile("last.json")) || {};
  if (last.game) games.add(last.game);
  // the game played most recently: the one whose state.json changed last (a game that crashed can leave its files behind)
  let game = null, newest = -1;
  for (const g of games) { let t = -1; try { t = fs.statSync(path.join(g, "hermes", "state.json")).mtimeMs; } catch {} if (t > newest) { newest = t; game = g; } }
  const st = game && readJson(path.join(game, "hermes", "state.json"));
  if (!st) return world || last.world || null;   // (it can be read while it's being written: try again next time)
  // the world open now; with none open (in the menus, or while a new world is being made), stay on the one being
  // followed, rather than going back to the last one played
  const w = st.world || (world ? null : st.last_world_joined);
  if (!w || !w.path) return world || last.world || null;
  const p = w.relative ? path.join(game, w.path) : w.path;
  if (game !== last.game || p !== last.world) fs.writeFileSync(ownFile("last.json"), JSON.stringify({game, world: p}));
  return p;
}

// ---------- Following the play log ----------
let world = null, file = null, offset = 0, rest = Buffer.alloc(0), text = "", raw = "", plain = false, lastParse = 0;   // (raw: the log as Hermes wrote it, for uploading)
let anchor = null;      // {igt, wall}: the IGT at the latest line, and when that was
let paused = true, open = false, changed = false;
let watchedLive = false;   // (the log grew while AA Live was following it: the world was played with it running)

function reset(w) {
  world = w; file = null; offset = 0; rest = Buffer.alloc(0); text = raw = ""; anchor = null; watchedLive = false; paused = true; open = false; changed = true;
  log(w ? "World: " + w : "Waiting for Minecraft (Hermes)…");
}

function readNew(sameWorld) {
  if (REPLAY) return replayTick();
  if (!sameWorld) { const w = findWorld(); if (w !== world) reset(w); }
  if (!world) return;
  const enc = path.join(world, "hermes", "restricted", "play.log.enc"), dec = path.join(world, "hermes", "play.log");
  const f = fs.existsSync(enc) ? enc : fs.existsSync(dec) ? dec : null;
  if (!f) return;
  watchLog(path.dirname(f));
  if (f !== file) { file = f; plain = f === dec; offset = 0; rest = Buffer.alloc(0); text = raw = ""; }
  let size; try { size = fs.statSync(f).size; } catch { return; }
  if (size < offset) { offset = 0; rest = Buffer.alloc(0); text = raw = ""; }   // (started again)
  if (size === offset) return;
  if (offset > 0) watchedLive = true;
  const fd = fs.openSync(f, "r"), chunk = Buffer.alloc(size - offset);
  try { fs.readSync(fd, chunk, 0, chunk.length, offset); } finally { fs.closeSync(fd); }
  offset = size;
  const buf = Buffer.concat([rest, chunk]), end = buf.lastIndexOf(10);
  if (end < 0) { rest = buf; return; }
  rest = Buffer.from(buf.subarray(end + 1));
  const lines = buf.subarray(0, end + 1);
  if (!plain) { let s = 0; for (let i = 0; i < lines.length; i++) if (lines[i] === 10) { rotate(lines.subarray(s, i)); s = i + 1; } }
  // times are SpeedRunIGT's retimed IGT ("retime"; the IGT rounded to game ticks): put it where "igt" is, so the
  // timer and the stats site's log reader (which read "igt") both use it
  const r = lines.toString("utf8"), t = r.replace(/"igt":\d+,"retime":(\d+)/g, '"igt":$1,"retime":$1');
  raw += r; text += t;
  for (const line of t.split("\n")) watchLine(line);
  changed = true;
}

// Read as soon as the game writes to the log (the system says when), not just on the next check
let watched = null, watcher = null;
function watchLog(dir) {
  if (watched === dir) return;
  try { if (watcher) watcher.close(); } catch {}
  watcher = null; watched = dir;
  try { watcher = fs.watch(dir, (ev, name) => { if (!name || String(name).startsWith("play.log")) tick(true); }); } catch {}   // (if not, the 100 ms check still reads it)
  if (watcher) watcher.on("error", () => { try { watcher.close(); } catch {} watcher = watched = null; });
}

// Underwater now: from the end of the world's ghost file (Hermes' position every tick: swimming, or below sea level),
// when it's written as the game goes. (The page only uses it in the ocean.) Real time of the last tick that was.
const SEA = 62, REC = 46;
function ghostWet() {
  if (REPLAY || !world) return null;
  try {
    const dir = path.join(world, "hermes", "ghosts");
    const f = fs.readdirSync(dir).filter(x => x.endsWith(".ghost")).map(x => path.join(dir, x)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    if (!f) return null;
    const size = fs.statSync(f).size, n = Math.min(Math.floor(size / REC), 20 * 15);   // (the last 15 seconds or so)
    if (!n) return null;
    const buf = Buffer.alloc(n * REC), fd = fs.openSync(f, "r");
    try { fs.readSync(fd, buf, 0, buf.length, Math.floor(size / REC) * REC - buf.length); } finally { fs.closeSync(fd); }
    let last = null;
    for (let i = 0; i < n; i++) {
      const o = i * REC, y = buf.readDoubleBE(o + 16), flags = buf[o + 45];
      if ((flags & 0x80) || y < SEA) last = Number(buf.readBigInt64BE(o));
    }
    return last;
  } catch { return null; }
}

// From the whole ghost file, every 10 seconds or so (every 2 in The End, waiting for the gateway): when they were deep in
// the Nether (below y 25, where debris is mined), so the Debris split starts when they go down there rather than at the
// first debris, when they got to the outer End, where Any% ends, when they left the enchanting table, where Enchanting
// ends, and when they got to their base before a campfire there, where Endgame starts. (Replaying a log: a .ghost beside it.)
let ghostCache = {f: null, size: -1, clock: 0, at: 0, facts: {}, marks: ""};
function ghostFacts(run) {
  try {
    let f = null;
    if (REPLAY) { const g = path.resolve(REPLAY.replace(/^~(?=\/)/, home)).replace(/\.log(\.enc)?$/, ".ghost"); if (g.endsWith(".ghost") && fs.existsSync(g)) f = g; }
    else if (world) {
      const dir = path.join(world, "hermes", "ghosts");
      f = fs.readdirSync(dir).filter(x => x.endsWith(".ghost")).map(x => path.join(dir, x)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
    }
    if (!f) return {};
    const size = fs.statSync(f).size;
    // (again when there's more of it, or more of the log to line it up with)
    // (and straight away for a new enchanting-table pickup or campfire: the splits that hang on them)
    const clock = (run.clock || []).length, marks = ["ench", "campfire"].map(k => (run.st[k] || []).length).join();
    if (f !== ghostCache.f || marks !== ghostCache.marks || ((size !== ghostCache.size || clock !== ghostCache.clock) && Date.now() - ghostCache.at > ((run.dims[run.dims.length - 1] || [])[1] === "e" ? 2000 : 10000))) {
      const g = GHOST.readGhost(fs.readFileSync(f), run);
      ghostCache = {f, size, clock, marks, at: Date.now(), facts: g ? GHOST.ghostFacts(g, run.st) : {}};
    }
    return ghostCache.facts;
  } catch { return {}; }
}

// What the timer needs, from each line (cheaply): the IGT, whether the world is open, and whether the game is paused
function watchLine(line) {
  if (!line.startsWith('{"time":')) return;
  const wall = parseInt(line.slice(8), 10), gi = line.lastIndexOf('"igt":');
  const q = line.indexOf('"type":"'), type = q > 0 ? line.slice(q + 8, line.indexOf('"', q + 8)) : "";
  // (always the latest line: a new world's first lines still have the last world's time, until SpeedRunIGT resets)
  if (gi > 0) anchor = {igt: parseInt(line.slice(gi + 6), 10), wall};
  if (type === "initialize") { open = true; paused = false; }
  else if (type === "close" || type === "server_shutdown") { open = false; paused = true; }
  else if (type === "screen") paused = line.includes('"is_pause":true');
}

// ---------- Playing back a run ----------
// The run's log is read up to the point it's at (t, its IGT); that point moves on while it plays, at its speed. The page
// counts the time up the same way (rate), and the slider and buttons on it move it (/replay).
const REPLAY = opt("replay");
let replay = null;   // {name, full, igts, offsets, total, t, playing, speed, at}
async function loadReplay() {
  let raw, name = REPLAY;
  if (/^\d+$/.test(REPLAY)) {
    // a run number: its log, from the stats site's repository on GitHub (https://<owner>.github.io/<repo>/ → logs/<n>.log)
    const m = /^https:\/\/([^./]+)\.github\.io\/([^/]+)/i.exec(SITE);
    if (!m) throw new Error("--replay with a run number needs a stats site on GitHub Pages (--site)");
    const url = `https://raw.githubusercontent.com/${m[1]}/${m[2]}/main/logs/${REPLAY}.log`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`run ${REPLAY} has no log on the stats site (${url}: HTTP ${res.status})`);
    raw = Buffer.from(await res.arrayBuffer()); name = "Run " + REPLAY;
  } else {
    raw = fs.readFileSync(path.resolve(REPLAY.replace(/^~(?=\/)/, home)));
    // (a live log still ciphered: unciphered line by line)
    if (REPLAY.endsWith(".enc")) { let s = 0; for (let i = 0; i <= raw.length; i++) if (i === raw.length || raw[i] === 10) { rotate(raw.subarray(s, i)); s = i + 1; } }
    name = path.basename(REPLAY);
  }
  const full = raw.toString("utf8").replace(/"igt":\d+,"retime":(\d+)/g, '"igt":$1,"retime":$1');
  const igts = [], offsets = [];
  let pos = 0, last = 0;
  for (const line of full.split("\n")) {
    pos += line.length + 1;
    const gi = line.lastIndexOf('"igt":');
    if (gi > 0) last = Math.max(last, parseInt(line.slice(gi + 6), 10) || 0);
    igts.push(last); offsets.push(pos);
  }
  replay = {name, full, igts, offsets, total: last, t: 0, playing: false, speed: 60, at: Date.now()};
  world = name; file = name; open = true;
  log(`Playing back ${name} (${fmt(last)} long): use the slider on the page`);
  setReplay({});
}
// moves it: {t, playing, speed}
function setReplay(o) {
  if (!replay) return;
  replayTick();
  if (o.t != null) replay.t = Math.max(0, Math.min(replay.total, o.t));
  if (o.playing != null) replay.playing = o.playing && replay.t < replay.total;
  if (o.speed != null) replay.speed = Math.max(1, Math.min(3600, o.speed));
  replayTick(true);
}
function replayTick(force) {
  if (!replay) return;
  const now = Date.now();
  if (replay.playing) { replay.t = Math.min(replay.total, replay.t + (now - replay.at) * replay.speed); if (replay.t >= replay.total) replay.playing = false; }
  replay.at = now;
  // the log up to there (the lines with an IGT up to t)
  let lo = 0, hi = replay.igts.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (replay.igts[mid] <= replay.t) lo = mid + 1; else hi = mid; }
  const upTo = lo ? replay.offsets[lo - 1] : 0;
  if (force || replay.playing || upTo !== text.length) {
    text = replay.full.slice(0, upTo);
    anchor = {igt: replay.t, wall: now};
    paused = !replay.playing; open = true;
    changed = true;
    if (force) lastParse = 0;
  }
}

// ---------- The splits ----------
let state = null;
function update() {
  if (!site) return;
  state = compute();
  // a run just finished (not one being played back): kept in runs/, to compare the next ones with (and again if its
  // time changes: thunder coming after a Thunderless finish)
  if (finished) {
    const key = site.api.runKey(finished), f = path.join(OWN, "runs", key + ".json");
    if (savedRuns.get(key) !== finished.finalIgt && (readJson(f) || {}).finalIgt !== finished.finalIgt) {
      try { fs.writeFileSync(f, JSON.stringify(site.api.encodeRun(finished))); log(`Run finished (${fmt(finished.finalIgt)}): saved, to compare the next ones with`); savedRuns.set(key, finished.finalIgt); loadSite(siteData, siteAt); state = compute(); }
      catch (e) { log("Couldn't save the finished run: " + e.message); }
    } else savedRuns.set(key, finished.finalIgt);
  }
  if (finished && !open) autoUpload(finished, world);
  const msg = "data: " + JSON.stringify(state) + "\n\n";
  for (const c of clients) c.write(msg);
}

// ---------- Uploading a finished run to the stats site ----------
// With a GitHub token in the settings (one that can write to the site's repository), a finished run is added to the
// site once its seed is known (/seed, or typed in when the world was made) and the world is left: its log, ghost file
// and stats, and its date and seed in runs.json, as the next run, in one commit (as the site's editor does; the site
// then builds itself). Each world only once, and not one already on the site.
const uploaded = new Set(readJson(ownFile("uploaded.json")) || []);
let uploading = false, uploadRetry = 0, uploadMsg = null;
const uploadOn = () => !!(settings.token && settings.autoUpload && siteData && siteData.repo && siteData.repo.full);
function autoUpload(run, w) {
  // (only a world played with AA Live running, not an old one it was started next to)
  if (REPLAY || uploading || !uploadOn() || !w || !watchedLive || !run.seed || Date.now() < uploadRetry) return;
  const key = worldOf(run);
  if (uploaded.has(key) || site.api.RUNS.some(r => !(r.meta && (r.meta.local || r.meta.wr)) && sameRun(r, run))) return;
  uploading = true;
  // (a few seconds first: Hermes writes the world's plain play.log on leaving it)
  setTimeout(async () => {
    try {
      const num = await uploadRun(run, w, siteData.repo);
      uploaded.add(key); try { fs.writeFileSync(ownFile("uploaded.json"), JSON.stringify([...uploaded])); } catch {}
      uploadMsg = `Run ${num} uploaded to the stats site (${new Date().toLocaleTimeString()}): it's on the site in a few minutes`;
      log(uploadMsg);
    } catch (e) {
      uploadRetry = Date.now() + 5 * 60000;   // (again in 5 minutes, if still not done)
      uploadMsg = "Couldn't upload the run to the stats site: " + e.message + " (trying again in 5 minutes)";
      log(uploadMsg); setTimeout(update, 5 * 60000 + 1000);
    } finally { uploading = false; update(); }
  }, 5000);
}
async function github(repo, p, opts = {}) {
  const res = await fetch((process.env.AA_LIVE_GITHUB_API || "https://api.github.com") + "/repos/" + repo + p, {method: opts.method || "GET",   // (the variable: for testing)
    headers: {Accept: "application/vnd.github+json", Authorization: "Bearer " + settings.token, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "AA-Live", ...(opts.body ? {"Content-Type": "application/json"} : {})},
    body: opts.body ? JSON.stringify(opts.body) : undefined});
  if (!res.ok) { let m = ""; try { m = (await res.json()).message || ""; } catch {} throw new Error(res.status === 401 ? "the GitHub token isn't valid (any more?)" : res.status === 403 || res.status === 404 ? `the GitHub token can't write to ${repo}` : `GitHub: ${res.status} ${m}`); }
  return res.status === 204 ? null : res.json();
}
async function uploadRun(run, w, {full, branch = "main"}) {
  // the log: the world's plain play.log if it has all of the run, else what was read while playing
  let logText = raw;
  try { const f = path.join(w, "hermes", "play.log"), t = fs.readFileSync(f, "utf8"); if (site.api.parseLog(t, "play.log").finalIgt >= run.finalIgt - 1000) logText = t; } catch {}
  // the player's ghost and stats files (named by their uuid)
  const pick = (dir, ext) => { try { const xs = fs.readdirSync(dir).filter(x => x.endsWith(ext)); const x = (run.uuid && xs.find(y => y.toLowerCase().startsWith(run.uuid.toLowerCase()))) || (xs.length === 1 ? xs[0] : null); return x ? path.join(dir, x) : null; } catch { return null; } };
  const ghostF = pick(path.join(w, "hermes", "ghosts"), ".ghost"), statsF = pick(path.join(w, "stats"), ".json");
  // the next run number: after every one in the repository (logs/, runs/, runs.json)
  const head = (await github(full, `/git/ref/heads/${branch}`)).object.sha;
  const base = (await github(full, `/git/commits/${head}`)).tree.sha;
  const paths = (await github(full, `/git/trees/${base}?recursive=1`)).tree.map(x => x.path);
  let details = {};
  if (paths.includes("runs.json")) { const f = await github(full, `/contents/runs.json?ref=${encodeURIComponent(branch)}`); details = JSON.parse(Buffer.from(f.content, "base64").toString("utf8")) || {}; }
  const nums = [...paths.map(p => (/^(?:logs|runs)\/(\d+)\./.exec(p) || [])[1]), ...Object.keys(details)].map(Number).filter(n => n > 0);
  const num = Math.max(0, ...nums) + 1;
  const d = new Date(run.start), date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  details[String(num)] = {date, seed: String(run.seed)};
  const files = [{path: `logs/${num}.log`, b64: Buffer.from(logText, "utf8").toString("base64")}, {path: "runs.json", text: JSON.stringify(details, null, 2) + "\n"}];
  if (ghostF) files.push({path: `logs/${num}.ghost`, b64: fs.readFileSync(ghostF).toString("base64")});
  if (statsF) files.push({path: `logs/${num}.stats.json`, text: fs.readFileSync(statsF, "utf8")});
  const tree = [];
  for (const f of files) {
    if (f.b64 != null) tree.push({path: f.path, mode: "100644", type: "blob", sha: (await github(full, "/git/blobs", {method: "POST", body: {content: f.b64, encoding: "base64"}})).sha});
    else tree.push({path: f.path, mode: "100644", type: "blob", content: f.text});
  }
  const t = await github(full, "/git/trees", {method: "POST", body: {base_tree: base, tree}});
  const c = await github(full, "/git/commits", {method: "POST", body: {message: `Add run ${num} (from AA Live)`, tree: t.sha, parents: [head]}});
  await github(full, `/git/refs/heads/${branch}`, {method: "PATCH", body: {sha: c.sha}});
  return num;
}

let finished = null;   // the run being followed, once it's finished
const savedRuns = new Map();   // (run key → its time when saved)
// The run so far, reading only what's new in the log since last time (it's all read again when the log started over,
// went back (a replay), or when a world opened again put the timer back, see fixTimerResets: then every time)
let reader = null, readerApi = null, fed = 0, fedEnd = "", refix = false;
function readRun(api) {
  const more = text.length >= fed && text.slice(Math.max(0, fed - 200), fed) === fedEnd ? text.slice(fed) : null;
  if (refix || !reader || readerApi !== api || more == null || (fed > 0 && more.includes('"type":"initialize"'))) {
    const fixed = api.fixTimerResets(text);
    refix = fixed !== text;
    reader = api.logReader("play.log"); readerApi = api;
    reader.feed(fixed);
  } else if (more) reader.feed(more);
  fed = text.length; fedEnd = text.slice(Math.max(0, fed - 200));
  return reader.result();
}
function compute() {
  finished = null;
  const {api} = site, n = api.SPLITS.length;
  const base = {v: VERSION, replay: replay ? {name: replay.name, t: replay.t, total: replay.total, playing: replay.playing, speed: replay.speed} : null,
    rate: replay && replay.playing ? replay.speed : 1, phone: (lanLinks()[0] || {}).url || null, title: site.title, siteRuns: site.runs, siteUrl: SITE, updateReady, siteAt: site.fetchedAt, comps: site.comps, icons: site.icons,
    world: world ? path.basename(world) : null, file: !!file, open, paused, anchor, now: Date.now(),
    upload: {token: !!settings.token, on: !!settings.autoUpload, repo: siteData && siteData.repo ? siteData.repo.full : null, msg: uploadMsg},
    display: display(), port: PORT};
  const empty = {...base, num: site.nextNum, done: false, igt: anchor ? anchor.igt : 0,
    splits: api.SPLITS.map((s, i) => ({name: s.name, icon: s.icon || api.FALLBACK_LAST_ICON, dur: 0, from: i === 0 ? 0 : null, has: false})),
    top: api.TOP.map((s, k) => ({name: s.name, icon: s.icon || api.FALLBACK_LAST_ICON, dur: 0, from: k === 0 ? 0 : null, has: false}))};
  if (!text) return empty;
  let run;
  try { run = readRun(api); } catch { return empty; }
  // (a replay: only what has happened so far. The ghost file up to now: the run's finalIgt is its last advancement)
  const now = anchor ? Math.max(anchor.igt, run.finalIgt) : run.finalIgt;
  const gf = ghostFacts({...run, finalIgt: now});
  run.st.deep = (gf.deep || []).filter(t => t <= now);
  if (gf.outerEnd != null && (!REPLAY || gf.outerEnd <= now + 1000)) run.st.outerEnd = gf.outerEnd;
  if (gf.campArrive) run.st.campArrive = gf.campArrive;
  if (gf.enchLeave) run.st.enchLeave = gf.enchLeave.filter(x => x[0] <= now).map(x => [x[0], x[1] != null && x[1] <= now ? x[1] : null]);
  // finished: everything done, or everything but Very Very Frightening once a channeling trident has been in the
  // inventory (Thunderless: waiting for thunder is then optional; if it still comes, the timer carries on)
  // (the stats site's own rule: a run that counts as Thunderful or Thunderless there)
  const done0 = api.derive(run).category !== "Invalid";
  if (done0 && !replay) finished = run;
  if (!done0) {
    // Still going: the run so far, as if it ended now (and as if back in the Overworld now, so a split that ends on
    // getting back there is shown as running)
    delete run._d;
    run.finalIgt = now;
    run.dims.push([now, "o", "live"]);   // ("live": the sub-splits leave it out)
  }
  const d = api.derive(run);
  const end = done0 ? run.finalIgt : now;
  // each split: its time so far, and when it's running, where the running part started
  const rows0Post = api.SPLITS.length - 1;
  const rows = d.splits.map((s, i) => {
    const segs = s.segs.filter(g => g[1] > g[0]);
    const last = segs[segs.length - 1], running = !done0 && last && last[1] === end;
    const dur = segs.reduce((a, g) => a + g[1] - g[0], 0);
    return {name: s.name, icon: s.icon, has: segs.length > 0, dur: running ? dur - (last[1] - last[0]) : dur, from: running ? last[0] : null, end: segs.length ? last[1] : null,
      start: s.start, subs: s.subs || null, mid: s.mid || null};
  });
  // nothing running yet (e.g. still in Any%, or between splits): the first split with nothing in it, from the end of the one before
  const firstEmpty = rows => { if (!done0 && !rows.some(r => r.from != null)) {
    const i = rows.findIndex(r => !r.has);
    if (i >= 0) rows[i].from = rows[i].start = i === 0 ? 0 : Math.max(0, ...rows.slice(0, i).filter(r => r.end != null).map(r => r.end));
  } };
  firstEmpty(rows);
  // the main splits (TOP), which the page lists, with the parts above under them
  const top = d.top.map((s, k) => {
    const segs = s.segs.filter(g => g[1] > g[0]), last = segs[segs.length - 1], running = !done0 && last && last[1] === end;
    // (Post-endgame, while it's on: the advancements still to get, their icons: config.js' LAST_ICON's, or the game's)
    const left = k === d.top.length - 1 && running ? d.missing.filter(id => id !== api.VVF).map(id => api.LAST_ICON[id] && site.icons[api.LAST_ICON[id]] ? api.LAST_ICON[id] : "adv:" + id) : null;
    const dur = segs.reduce((a, g) => a + g[1] - g[0], 0);
    return {name: s.name, icon: s.icon, left, has: segs.length > 0, dur: running ? dur - (last[1] - last[0]) : dur, from: running ? last[0] : null, end: segs.length ? last[1] : null, start: s.start};
  });
  firstEmpty(top);
  // its run number: the site's, if it's already on the site (looking at an old world), or the next one
  const known = api.RUNS.find(r => sameRun(r, run));
  const num = known ? api.runNum(known) : site.nextNum;
  // a Hermes that doesn't log biomes (before 0.14): the page says to update it (after a minute of the world, so it's
  // not said before the first biome line comes)
  const hv = /"hermes_version":"([^"]+)"/.exec(text);
  const oldHermes = run.st.noBiomes && end > 60000 ? (hv ? hv[1].replace(/\+.*/, "") : "?") : null;
  const wetAt = ghostWet();
  // (the advancements' icons it needs now: Post-endgame's, see rows)
  const need = [...rows, ...top].flatMap(r => [r.icon, ...(r.left || [])]).filter(k => k && k.startsWith("adv:") && ITEM_ICONS[k]);
  const icons = need.length ? {...site.icons, ...Object.fromEntries(need.map(k => [k, ITEM_ICONS[k]]))} : site.icons;
  return {...base, icons, num, done: done0, igt: end, splits: rows, top, oldHermes, wet: wetAt != null && Date.now() - wetAt < 10000};
}

// ---------- The page ----------
const clients = new Set();
const server = http.createServer((req, res) => {
  const from = String(req.socket.remoteAddress || "").replace(/^::ffff:/, "");
  if (from && from !== "127.0.0.1" && from !== "::1" && !seenDevices.has(from)) { seenDevices.add(from); log(`A device at ${from} opened the page`); }
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/events") {
    res.writeHead(200, {"content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "access-control-allow-origin": "*"});
    res.write("retry: 1000\n\n");
    if (state) res.write("data: " + JSON.stringify(state) + "\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
  } else if (url.pathname === "/replay" && replay) {
    const q = url.searchParams, num = k => q.has(k) && Number.isFinite(+q.get(k)) ? +q.get(k) : null;
    setReplay({t: num("t"), playing: q.has("play") ? q.get("play") === "1" : null, speed: num("speed")});
    res.writeHead(204); res.end();
  } else if (url.pathname === "/settings" && req.method === "POST") {
    // the settings page's saves (on this computer only)
    if (!["127.0.0.1", "::1", ""].includes(from)) { res.writeHead(403); return res.end(); }
    let body = "";
    req.on("data", c => { body += c; if (body.length > 10000) req.destroy(); });
    req.on("end", () => {
      const j = (() => { try { return JSON.parse(body); } catch { return null; } })();
      // (how the splits look: any of them)
      if (j && j.display && typeof j.display === "object") {
        const d = {...display()}, x = j.display, num = (v, a, b) => Number.isFinite(+v) ? Math.min(b, Math.max(a, +v)) : null;
        if (["auto", "pb", "avg", "best", "worst", "wr"].includes(x.comp)) d.comp = x.comp;
        // (the timer's digits, as in LiveSplit: 1 › 1:23 › 1:23:45 as it grows, always 0:01, or always 0:00:01)
        if (["s", "m", "h"].includes(x.clock)) d.clock = x.clock;
        if (num(x.ms, 0, 3) != null) d.ms = Math.round(num(x.ms, 0, 3));
        if (num(x.rows, 2, 30) != null) d.rows = Math.round(num(x.rows, 2, 30));
        if (num(x.scale, 0.5, 4) != null) d.scale = Math.round(num(x.scale, 0.5, 4) * 100) / 100;
        if ("bg" in x) d.bg = x.bg === null || x.bg === "" ? null : num(x.bg, 0, 100);
        settings.display = d;
        if (j.site === undefined) { try { fs.writeFileSync(ownFile("settings.json"), JSON.stringify(settings, null, 2)); } catch {} update(); res.writeHead(204); return res.end(); }
      }
      const s = j && typeof j.site === "string" ? j.site.trim() : null;
      if (s == null || (s && !/^https?:\/\/\S+$/i.test(s))) { res.writeHead(400); return res.end("The stats site has to be a link (https://…), or empty"); }
      // (uploading: on or off, and a GitHub token, only when one's typed in: "-" forgets it)
      if (typeof j.autoUpload === "boolean") settings.autoUpload = j.autoUpload;
      if (typeof j.token === "string" && j.token.trim()) { const k = j.token.trim(); if (k === "-") delete settings.token; else if (/^[\w-]{20,255}$/.test(k)) settings.token = k; else { res.writeHead(400); return res.end("That doesn't look like a GitHub token"); } }
      const siteChanged = s !== SITE;
      settings.site = s; SITE = s;
      try { fs.writeFileSync(ownFile("settings.json"), JSON.stringify(settings, null, 2)); } catch {}
      if (siteChanged) { log(s ? "Stats site set to " + s : "No stats site: comparing with the runs finished with AA Live"); site = null; fetchSite(); }
      else update();
      res.writeHead(204); res.end();
    });
  } else if (url.pathname === "/state.json") {
    res.writeHead(200, {"content-type": "application/json"}); res.end(JSON.stringify(state));
  } else if (url.pathname === "/") {
    // (with how the splits look in it: the page reloads itself when that changes)
    res.writeHead(200, {"content-type": "text/html; charset=utf-8", "cache-control": "no-cache"}); res.end(PAGE.replace("/*DISPLAY*/{}", () => JSON.stringify(display())));
  } else if (url.pathname === "/settings" && req.method === "GET") {
    if (!["127.0.0.1", "::1", ""].includes(from)) { res.writeHead(403); return res.end("The settings open on this computer only"); }
    res.writeHead(200, {"content-type": "text/html; charset=utf-8", "cache-control": "no-cache"}); res.end(SETTINGS_PAGE);
  } else if (url.pathname === "/report.txt") {
    // a bug report: this version and computer, the settings (not the token), what it printed, and the state it's in
    if (!["127.0.0.1", "::1", ""].includes(from)) { res.writeHead(403); return res.end(); }
    const {token, ...safe} = settings;
    const st = state ? {...state, comps: Object.keys(state.comps || {}), icons: undefined, splits: (state.splits || []).map(x => ({name: x.name, dur: x.dur, from: x.from, has: x.has}))} : null;
    const text = [`AA Live ${VERSION} (build ${BUILD}) · ${process.platform} ${process.arch} · Node ${process.version} · ${new Date().toISOString()}`,
      `World: ${world || "-"}\nLog: ${file || "-"}`, "", "Settings: " + JSON.stringify({...safe, token: token ? "(saved)" : null}, null, 2), "",
      "What it printed:", ...logLines, "", "State: " + JSON.stringify(st, null, 2)].join("\n");
    res.writeHead(200, {"content-type": "text/plain; charset=utf-8", "content-disposition": 'attachment; filename="aa-live-report.txt"'}); res.end(text);
  } else { res.writeHead(404); res.end(); }
});
server.on("error", e => { console.error(e.code === "EADDRINUSE" ? `Port ${PORT} is in use (is AA Live already running?). Use --port to pick another.` : e.message); process.exit(1); });
server.listen(PORT, LAN ? "0.0.0.0" : "127.0.0.1", () => {
  const link = `http://localhost:${PORT}/`, lan = lanLinks();
  console.log(`\nAA Live ${VERSION}\n  Splits (and the OBS browser source): ${link}`
    + (LAN ? lan.length ? `\n  On your phone (same Wi-Fi):          ` + lan.map(l => l.url + (lan.length > 1 ? ` (${l.name}${l.wifi ? ", Wi-Fi" : ""})` : "")).join("\n                                       ") : "\n  (No Wi-Fi address found: is this computer on a network?)" : "")
    + `\n  Settings:      ${link}settings`
    + `\n  Stats site:    ${SITE || "(none: set one in the settings, or it compares with the runs you finish with AA Live)"}\n  Its folder:    ${OWN}\n`);
  checkFirewall();
  // (the splits, opened in the browser)
  if (!args.includes("--no-open")) {
    if (process.platform === "darwin") execFile("open", [link], () => {});
    else if (process.platform === "win32") execFile("cmd", ["/c", "start", "", link], () => {});
    else execFile("xdg-open", [link], () => {});
  }
});

// ---------- Running ----------
const fmt = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
reset(null);
fetchSite();
if (REPLAY) loadReplay().catch(e => { console.error("Couldn't play back " + REPLAY + ": " + e.message); process.exit(1); });
setInterval(fetchSite, 30 * 60000);
// (pausing, unpausing and opening or closing the world go to the page straight away, without the splits)
let quickSent = "";
function tick(sameWorld) {
  try { readNew(sameWorld); } catch (e) { log("Couldn't read the play log: " + e.message); }
  const q = JSON.stringify({open, paused, anchor});
  if (q !== quickSent) { quickSent = q; const msg = "event: quick\ndata: " + q + "\n\n"; for (const c of clients) c.write(msg); }
  // the splits are worked out again at most 5 times a second (only the new lines are read: see readRun)
  if (changed && Date.now() - lastParse >= 200) { changed = false; lastParse = Date.now(); update(); }
}
setInterval(tick, 100);
// keep OBS's connection alive
setInterval(() => { for (const c of clients) c.write(": .\n\n"); }, 15000);
