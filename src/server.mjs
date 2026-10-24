/*
 * AA Live — a live splitter for AA No Reset (1.16.1) runs, read from Hermes.
 *
 * Finds the Minecraft instance Hermes is running in, follows the world's live play log as it's written, works out the
 * splits the same way the stats site does (the site's own code is inside this file), and compares them with the runs
 * on the stats site. The splits are shown on a page served here: open it in a browser, or add it to OBS as a
 * browser source.
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
import { execFile } from "node:child_process";
import { rotate } from "./rotator.mjs";

// (gen.mjs puts these in)
const SITE_CODE = /*SITE_CODE*/"";
const PAGE = /*PAGE*/"";
const ITEM_ICONS = /*ITEM_ICONS*/{};   // the sub-splits' and the Midgame checklist's icons (see build.mjs)
const VERSION = "0.1";

// ---------- Settings ----------
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : undefined; };
const DEFAULT_SITE = "https://zesskyo.github.io/aa-stats-no-reset-zesskyo-log/";
const SITE = opt("site") || DEFAULT_SITE;
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
// this program's own folder: the last stats site download (for when there's no internet) and the last world
const OWN = process.platform === "darwin" ? path.join(home, "Library", "Application Support", "AA Live") : path.join(home, ".aa-live");
fs.mkdirSync(OWN, {recursive: true});
const ownFile = f => path.join(OWN, f);
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const log = (...m) => console.log(new Date().toLocaleTimeString(), ...m);

// ---------- The stats site's code and runs ----------
let site = null;   // {api, comps, icons, title, runs, fetchedAt}
function loadSite(data, fetchedAt) {
  const document = {getElementById: () => ({textContent: JSON.stringify(data)})};
  const api = new Function("document", SITE_CODE + "\nreturn {parseLog, derive, validRuns, pbRun, RUNS, runNum, WR, SPLITS, ADV, ICONS, LAST_ICON, FALLBACK_LAST_ICON, VVF, T};")(document);
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
  for (const k of [...api.SPLITS.map(s => s.icon), ...Object.values(api.LAST_ICON || {}), api.FALLBACK_LAST_ICON]) if (k && api.ICONS[k]) icons[k] = api.ICONS[k];
  Object.assign(icons, ITEM_ICONS);
  // the run number for a new run: one after the site's last
  const nextNum = Math.max(0, ...api.RUNS.map(r => api.runNum(r))) + 1;
  site = {api, comps, icons, nextNum, title: (data.text && data.text.siteTitle) || "AA No Reset", runs: valid.length, fetchedAt};
  log(`Stats site: ${valid.length} runs` + (pb ? `, PB ${fmt(pb.finalIgt)}` : "") + (wr ? `, WR ${fmt(wr.finalIgt)}` : ""));
}

async function fetchSite() {
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
let world = null, file = null, offset = 0, rest = Buffer.alloc(0), text = "", plain = false, lastParse = 0;
let anchor = null;      // {igt, wall}: the IGT at the latest line, and when that was
let paused = true, open = false, changed = false;

function reset(w) {
  world = w; file = null; offset = 0; rest = Buffer.alloc(0); text = ""; anchor = null; paused = true; open = false; changed = true;
  log(w ? "World: " + w : "Waiting for Minecraft (Hermes)…");
}

function readNew() {
  if (REPLAY) return replayTick();
  const w = findWorld();
  if (w !== world) reset(w);
  if (!world) return;
  const enc = path.join(world, "hermes", "restricted", "play.log.enc"), dec = path.join(world, "hermes", "play.log");
  const f = fs.existsSync(enc) ? enc : fs.existsSync(dec) ? dec : null;
  if (!f) return;
  if (f !== file) { file = f; plain = f === dec; offset = 0; rest = Buffer.alloc(0); text = ""; }
  let size; try { size = fs.statSync(f).size; } catch { return; }
  if (size < offset) { offset = 0; rest = Buffer.alloc(0); text = ""; }   // (started again)
  if (size === offset) return;
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
  const t = lines.toString("utf8").replace(/"igt":\d+,"retime":(\d+)/g, '"igt":$1,"retime":$1');
  text += t;
  for (const line of t.split("\n")) watchLine(line);
  changed = true;
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
  const msg = "data: " + JSON.stringify(state) + "\n\n";
  for (const c of clients) c.write(msg);
}

function compute() {
  const {api} = site, n = api.SPLITS.length;
  const base = {v: VERSION, replay: replay ? {name: replay.name, t: replay.t, total: replay.total, playing: replay.playing, speed: replay.speed} : null,
    rate: replay && replay.playing ? replay.speed : 1, phone: (lanLinks()[0] || {}).url || null, title: site.title, siteRuns: site.runs, siteAt: site.fetchedAt, comps: site.comps, icons: site.icons,
    world: world ? path.basename(world) : null, file: !!file, open, paused, anchor, now: Date.now()};
  const empty = {...base, num: site.nextNum, done: false, igt: anchor ? anchor.igt : 0,
    splits: api.SPLITS.map((s, i) => ({name: s.name, icon: s.icon || api.FALLBACK_LAST_ICON, dur: 0, from: i === 0 ? 0 : null, has: false}))};
  if (!text) return empty;
  let run;
  try { run = api.parseLog(text, "play.log"); } catch { return empty; }
  // finished: everything done, or everything but Very Very Frightening once a channeling trident has been in the
  // inventory (Thunderless: waiting for thunder is then optional; if it still comes, the timer carries on)
  // (the stats site's own rule: a run that counts as Thunderful or Thunderless there)
  const done0 = api.derive(run).category !== "Invalid";
  const now = anchor ? Math.max(anchor.igt, run.finalIgt) : run.finalIgt;
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
  const rows = d.splits.map((s, i) => {
    const segs = s.segs.filter(g => g[1] > g[0]);
    const last = segs[segs.length - 1], running = !done0 && last && last[1] === end;
    const dur = segs.reduce((a, g) => a + g[1] - g[0], 0);
    return {name: s.name, icon: s.icon, has: segs.length > 0, dur: running ? dur - (last[1] - last[0]) : dur, from: running ? last[0] : null, end: segs.length ? last[1] : null,
      start: s.start, subs: s.subs || null, mid: s.mid || null};
  });
  // nothing running yet (e.g. still in Any%, or between splits): the first split with nothing in it, from the end of the one before
  if (!done0 && !rows.some(r => r.from != null)) {
    const i = rows.findIndex(r => !r.has);
    if (i >= 0) rows[i].from = rows[i].start = i === 0 ? 0 : Math.max(0, ...rows.slice(0, i).filter(r => r.end != null).map(r => r.end));
  }
  // its run number: the site's, if it's already on the site (looking at an old world), or the next one
  const known = api.RUNS.find(r => r.start === run.start && r.player === run.player);
  const num = known ? api.runNum(known) : site.nextNum;
  return {...base, num, done: done0, igt: end, splits: rows};
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
  } else if (url.pathname === "/state.json") {
    res.writeHead(200, {"content-type": "application/json"}); res.end(JSON.stringify(state));
  } else if (url.pathname === "/") {
    res.writeHead(200, {"content-type": "text/html; charset=utf-8", "cache-control": "no-cache"}); res.end(PAGE);
  } else { res.writeHead(404); res.end(); }
});
server.on("error", e => { console.error(e.code === "EADDRINUSE" ? `Port ${PORT} is in use (is AA Live already running?). Use --port to pick another.` : e.message); process.exit(1); });
server.listen(PORT, LAN ? "0.0.0.0" : "127.0.0.1", () => {
  const link = `http://localhost:${PORT}/`, lan = lanLinks();
  console.log(`\nAA Live ${VERSION}\n  Splits (and the OBS browser source): ${link}`
    + (LAN ? lan.length ? `\n  On your phone (same Wi-Fi):          ` + lan.map(l => l.url + (lan.length > 1 ? ` (${l.name}${l.wifi ? ", Wi-Fi" : ""})` : "")).join("\n                                       ") : "\n  (No Wi-Fi address found: is this computer on a network?)" : "")
    + `\n  Stats site:    ${SITE}\n`);
  checkFirewall();
  if (!args.includes("--no-open") && process.platform === "darwin") execFile("open", [link], () => {});
});

// ---------- Running ----------
const fmt = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
reset(null);
fetchSite();
if (REPLAY) loadReplay().catch(e => { console.error("Couldn't play back " + REPLAY + ": " + e.message); process.exit(1); });
setInterval(fetchSite, 30 * 60000);
setInterval(() => {
  try { readNew(); } catch (e) { log("Couldn't read the play log: " + e.message); }
  // the splits are worked out again at most once a second (the whole log is read each time)
  if (changed && Date.now() - lastParse >= 1000) { changed = false; lastParse = Date.now(); update(); }
}, 250);
// keep OBS's connection alive
setInterval(() => { for (const c of clients) c.write(": .\n\n"); }, 15000);
