// Builds app/aa-live.mjs: one file with everything in it (the stats site's code, the page and its fonts).
// Usage: node build.mjs <aa-stats folder>   (the code of the stats site: https://github.com/zesskyo/aa-stats)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";   // (Windows paths)
const here = path.dirname(fileURLToPath(import.meta.url)), A = path.resolve(process.argv[2] || "../aa-stats");
const rd = f => fs.readFileSync(f, "utf8");
// the stats site's code the splitter uses (so it reads logs and works out splits exactly like the site)
const SITE = ["text.js", "config.js", "helpers.js", "parse-log.js", "runs.js", "splits.js", "stats.js"].map(f => `/* ======== ${f} ======== */\n` + rd(path.join(A, "src", f))).join("\n");
// the item icons of the sub-splits and the Midgame checklist (config.js' SUB_ITEMS and MIDGAME), cut out of the stats site's item atlas
const { readPng, writePng, pickSquares } = await import(pathToFileURL(path.join(A, "png.mjs")).href);
const { SUB_ITEMS, MIDGAME } = new Function(rd(path.join(A, "src/config.js")) + "\nreturn { SUB_ITEMS, MIDGAME };")();
const items = JSON.parse(rd(path.join(A, "items/items.json"))), atlas = readPng(fs.readFileSync(path.join(A, "items/atlas.png")));
// (keys as the page uses them: "item:<item>", "item:icon:<name>" for the stats site's own icons, and the checklist's goals'
// "at:<biome>", "mh:<mob>" and "2x2:<animal>", from the stats site's icon folders)
const ITEM_ICONS = {};
const png = f => "data:image/png;base64," + fs.readFileSync(f).toString("base64");
const ADV_ITEMS = new Function(rd(path.join(A, "src/splits.js")) + "\nreturn ADV_ITEMS;")();
const itemIds = new Set([...Object.values(SUB_ITEMS), ...MIDGAME.map(m => m.item).filter(x => !x.includes(":") || x.startsWith("icon:")), ...Object.values(ADV_ITEMS), "book", "cod", "tnt",
  ...MIDGAME.flatMap(m => [...(m.goals || []), ...(m.extra ? m.extra.goals : [])]).filter(g => g[0] === "food").map(g => g[1][0]),
  ...MIDGAME.flatMap(m => m.goals || []).filter(g => g[0] === "mush").map(g => g[1])]);
for (const id of itemIds) {
  if (id.startsWith("icon:")) { ITEM_ICONS["item:" + id] = png(path.join(A, "icons", id.slice(5) + ".png")); continue; }
  if (items.index[id] == null) throw new Error("items.json has no " + id);
  ITEM_ICONS["item:" + id] = "data:image/png;base64," + writePng(pickSquares(atlas, items.size, 1, [items.index[id]])).toString("base64");
}
for (const [prefix, dir] of [["at:", "adventuring time"], ["mh:", "monsters hunted"], ["2x2:", "two by two"], ["acc:", "acc"]])
  for (const f of fs.readdirSync(path.join(A, "icons", dir))) if (f.endsWith(".png")) ITEM_ICONS[prefix + f.slice(0, -4)] = png(path.join(A, "icons", dir, f));
// (the icon files named after a biome's newer name: the game's 1.16 one is used in the checklist)
ITEM_ICONS["at:snowy_tundra"] = ITEM_ICONS["at:snowy_plains"];
// every advancement's icon, as the game shows it ("adv:<id>"): Post-endgame's goes through those still to get
for (const [id, [it]] of Object.entries(items.adv || {})) if (items.index[it] != null) ITEM_ICONS["adv:" + id] = "data:image/png;base64," + writePng(pickSquares(atlas, items.size, 1, [items.index[it]])).toString("base64");
// the splits' own icons (and every possible Post-endgame one), for when there's no stats site to take them from: the
// stats site's icons folder, or an item ("star": a nether star)
const { SPLITS, LAST_ICON, FALLBACK_LAST_ICON } = new Function(rd(path.join(A, "src/config.js")) + "\nreturn { SPLITS, LAST_ICON, FALLBACK_LAST_ICON };")();
const BASE_ICONS = {}, ITEM_FOR = {star: "nether_star"};
for (const k of new Set([...SPLITS.map(s => s.icon), ...Object.values(LAST_ICON), FALLBACK_LAST_ICON].filter(Boolean))) {
  const f = path.join(A, "icons", k + ".png"), id = ITEM_FOR[k] || k;
  if (fs.existsSync(f)) BASE_ICONS[k] = png(f);
  else if (items.index[id] != null) BASE_ICONS[k] = "data:image/png;base64," + writePng(pickSquares(atlas, items.size, 1, [items.index[id]])).toString("base64");
}
let page = rd(path.join(here, "src/page.html"));
let settingsPage = rd(path.join(here, "src/settings.html"));
for (const [k, f] of [["/*FONT_R*/", "MinecraftRegular.otf"], ["/*FONT_B*/", "MinecraftBold.otf"]]) { const b64 = fs.readFileSync(path.join(A, "fonts", f)).toString("base64"); page = page.replace(k, () => b64); settingsPage = settingsPage.replace(k, () => b64); }
let s = rd(path.join(here, "src/server.mjs"));
const rot = rd(path.join(here, "src/rotator.mjs")).replace("export function rotate", "function rotate");
const put = (k, v) => { if (!s.includes(k)) throw new Error("server.mjs has no " + k); s = s.replace(k, () => v); };
put('import { rotate } from "./rotator.mjs";', "\n" + rot);
put('/*SITE_CODE*/""', JSON.stringify(SITE));
// (and its ghost file reader: when the player is deep in the Nether, for the Debris split)
put('/*GHOST_CODE*/""', JSON.stringify(rd(path.join(A, "ghost.mjs")).replace(/export function/g, "function") + "\nreturn {readGhost, ghostFacts};"));
put('/*PAGE*/""', JSON.stringify(page));
put('/*SETTINGS_PAGE*/""', JSON.stringify(settingsPage));
put('/*ITEM_ICONS*/{}', JSON.stringify(ITEM_ICONS));
put('/*BASE_ICONS*/{}', JSON.stringify(BASE_ICONS));
put('/*BUILD*/0', String(Date.now()));   // (for updating: see "Updating itself" in server.mjs)
fs.mkdirSync(path.join(here, "app"), {recursive: true});
fs.writeFileSync(path.join(here, "app/aa-live.mjs"), s);
console.log("wrote app/aa-live.mjs", (s.length / 1024).toFixed(0) + " KB");
