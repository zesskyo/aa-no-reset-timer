/*
 * AA Live — a live splitter for AA No Reset (1.16.1) runs, read from Hermes.
 *
 * Finds the Minecraft instance Hermes is running in, follows the world's live play log as it's written, works out the
 * splits the same way the stats site does (the site's own code is inside this file), and compares them with the runs
 * on the stats site. The splits are shown on a page served here: open it in a browser, or add it to OBS as a
 * browser source.
 *
 * Usage: node aa-live.mjs [--site <stats site link>] [--port 7476] [--world <world folder>] [--no-open]
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
const ITEM_ICONS = /*ITEM_ICONS*/{};   // the sub-splits' items, 64 pixels
const VERSION = "0.1";

// ---------- Settings ----------
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : undefined; };
const DEFAULT_SITE = "https://zesskyo.github.io/aa-stats-no-reset-zesskyo-log/";
const SITE = opt("site") || DEFAULT_SITE;
const PORT = Number(opt("port") || 7476);
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
  // the fastest each step has been reached into its split (for gold)
  if (comps.best) comps.best.subInto = api.SPLITS.map((_, i) => { const n = Math.max(0, ...into.map(x => x[i] ? x[i].length : 0)); return n ? [...Array(n)].map((_, j) => { const xs = into.map(x => x[i] && x[i][j]).filter(v => v != null); return xs.length ? Math.min(...xs) : null; }) : null; });
  // icons the page needs: the splits', and every possible last-advancement icon (for Post-endgame)
  const icons = {};
  for (const k of [...api.SPLITS.map(s => s.icon), ...Object.values(api.LAST_ICON || {}), api.FALLBACK_LAST_ICON]) if (k && api.ICONS[k]) icons[k] = api.ICONS[k];
  for (const [k, v] of Object.entries(ITEM_ICONS)) icons["item:" + k] = v;
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
let world = null, file = null, offset = 0, rest = Buffer.alloc(0), text = "", plain = false;
let anchor = null;      // {igt, wall}: the IGT at the latest line, and when that was
let paused = true, open = false, changed = false;

function reset(w) {
  world = w; file = null; offset = 0; rest = Buffer.alloc(0); text = ""; anchor = null; paused = true; open = false; changed = true;
  log(w ? "World: " + w : "Waiting for Minecraft (Hermes)…");
}

function readNew() {
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
  const base = {v: VERSION, title: site.title, siteRuns: site.runs, siteAt: site.fetchedAt, comps: site.comps, icons: site.icons,
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
      start: s.start, subs: s.subs || null};
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
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/events") {
    res.writeHead(200, {"content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "access-control-allow-origin": "*"});
    res.write("retry: 1000\n\n");
    if (state) res.write("data: " + JSON.stringify(state) + "\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
  } else if (url.pathname === "/state.json") {
    res.writeHead(200, {"content-type": "application/json"}); res.end(JSON.stringify(state));
  } else if (url.pathname === "/") {
    res.writeHead(200, {"content-type": "text/html; charset=utf-8", "cache-control": "no-cache"}); res.end(PAGE);
  } else { res.writeHead(404); res.end(); }
});
server.on("error", e => { console.error(e.code === "EADDRINUSE" ? `Port ${PORT} is in use (is AA Live already running?). Use --port to pick another.` : e.message); process.exit(1); });
server.listen(PORT, "127.0.0.1", () => {
  const link = `http://localhost:${PORT}/`;
  console.log(`\nAA Live ${VERSION}\n  Splits (and the OBS browser source): ${link}\n  Stats site:    ${SITE}\n`);
  if (!args.includes("--no-open") && process.platform === "darwin") execFile("open", [link], () => {});
});

// ---------- Running ----------
const fmt = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
reset(null);
fetchSite();
setInterval(fetchSite, 30 * 60000);
let lastParse = 0;
setInterval(() => {
  try { readNew(); } catch (e) { log("Couldn't read the play log: " + e.message); }
  // the splits are worked out again at most once a second (the whole log is read each time)
  if (changed && Date.now() - lastParse >= 1000) { changed = false; lastParse = Date.now(); update(); }
}, 250);
// keep OBS's connection alive
setInterval(() => { for (const c of clients) c.write(": .\n\n"); }, 15000);
