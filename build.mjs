// Builds app/aa-live.mjs: one file with everything in it (the stats site's code, the page and its fonts).
// Usage: node build.mjs <aa-stats folder>   (the code of the stats site: https://github.com/zesskyo/aa-stats)
import fs from "node:fs";
import path from "node:path";
const here = path.dirname(new URL(import.meta.url).pathname), A = path.resolve(process.argv[2] || "../aa-stats");
const rd = f => fs.readFileSync(f, "utf8");
// the stats site's code the splitter uses (so it reads logs and works out splits exactly like the site)
const SITE = ["text.js", "config.js", "helpers.js", "parse-log.js", "runs.js", "splits.js", "stats.js"].map(f => `/* ======== ${f} ======== */\n` + rd(path.join(A, "src", f))).join("\n");
// the sub-splits' item icons (config.js' SUB_ITEMS), cut out of the stats site's item atlas
const { readPng, writePng, pickSquares } = await import(path.join(A, "png.mjs"));
const SUB_ITEMS = new Function(rd(path.join(A, "src/config.js")) + "\nreturn SUB_ITEMS;")();
const items = JSON.parse(rd(path.join(A, "items/items.json"))), atlas = readPng(fs.readFileSync(path.join(A, "items/atlas.png")));
const ITEM_ICONS = {};
for (const id of new Set(Object.values(SUB_ITEMS))) {
  // ("icon:<name>": one of the stats site's own icons)
  if (id.startsWith("icon:")) { ITEM_ICONS[id] = "data:image/png;base64," + fs.readFileSync(path.join(A, "icons", id.slice(5) + ".png")).toString("base64"); continue; }
  if (items.index[id] == null) throw new Error("items.json has no " + id);
  ITEM_ICONS[id] = "data:image/png;base64," + writePng(pickSquares(atlas, items.size, 1, [items.index[id]])).toString("base64");
}
let page = rd(path.join(here, "src/page.html"));
for (const [k, f] of [["/*FONT_R*/", "MinecraftRegular.otf"], ["/*FONT_B*/", "MinecraftBold.otf"]]) page = page.replace(k, () => fs.readFileSync(path.join(A, "fonts", f)).toString("base64"));
let s = rd(path.join(here, "src/server.mjs"));
const rot = rd(path.join(here, "src/rotator.mjs")).replace("export function rotate", "function rotate");
const put = (k, v) => { if (!s.includes(k)) throw new Error("server.mjs has no " + k); s = s.replace(k, () => v); };
put('import { rotate } from "./rotator.mjs";', "\n" + rot);
put('/*SITE_CODE*/""', JSON.stringify(SITE));
put('/*PAGE*/""', JSON.stringify(page));
put('/*ITEM_ICONS*/{}', JSON.stringify(ITEM_ICONS));
fs.mkdirSync(path.join(here, "app"), {recursive: true});
fs.writeFileSync(path.join(here, "app/aa-live.mjs"), s);
console.log("wrote app/aa-live.mjs", (s.length / 1024).toFixed(0) + " KB");
