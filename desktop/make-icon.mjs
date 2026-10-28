// Makes desktop/icon.png (512×512): Minecraft's clock, from the stats site's item atlas, scaled up pixel by pixel.
// Usage: node desktop/make-icon.mjs <aa-stats folder>
import fs from "node:fs";
import path from "node:path";
const A = path.resolve(process.argv[2] || "../aa-stats"), here = path.dirname(new URL(import.meta.url).pathname);
const { readPng, writePng, pickSquares } = await import(path.join(A, "png.mjs"));
const items = JSON.parse(fs.readFileSync(path.join(A, "items/items.json"), "utf8"));
const one = pickSquares(readPng(fs.readFileSync(path.join(A, "items/atlas.png"))), items.size, 1, [items.index.clock]);
const S = 512, k = Math.floor(S / one.w), off = Math.floor((S - one.w * k) / 2), px = Buffer.alloc(S * S * 4);
for (let y = 0; y < one.h * k; y++) for (let x = 0; x < one.w * k; x++) {
  const s = ((Math.floor(y / k)) * one.w + Math.floor(x / k)) * 4, d = ((y + off) * S + x + off) * 4;
  one.px.copy(px, d, s, s + 4);
}
fs.writeFileSync(path.join(here, "icon.png"), writePng({w: S, h: S, px}));
console.log("wrote desktop/icon.png");
