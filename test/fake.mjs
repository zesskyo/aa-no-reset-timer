// For testing without Minecraft: pretends to be Minecraft + Hermes, having played a real play.log up to <minutes> of IGT.
// It makes a pretend home folder (test/home) with a game folder, Hermes' files and the ciphered live log in it.
// Usage: node test/fake.mjs <play.log> <minutes> [paused]
//   then: HOME=test/home node app/aa-live.mjs
import fs from "node:fs"; import path from "node:path";
import { rotate } from "../src/rotator.mjs";
const [log, mins, paused] = process.argv.slice(2);
const home = path.join(path.dirname(new URL(import.meta.url).pathname), "home");
const game = path.join(home, "mc"), world = path.join(game, "saves", "AA Run 29");
const instances = [".local/share/MCSRHermes/instances", "Library/Application Support/MCSRHermes/instances"];   // (Linux, Mac)
fs.mkdirSync(path.join(game, "hermes"), {recursive: true});
fs.mkdirSync(path.join(world, "hermes/restricted"), {recursive: true});
for (const d of instances) { fs.mkdirSync(path.join(home, d), {recursive: true}); fs.writeFileSync(path.join(home, d, "1234.json"), JSON.stringify({pid: 1234, game_dir: game})); }
fs.writeFileSync(path.join(game, "hermes/state.json"), JSON.stringify({screen: null, world: {relative: true, path: "saves/AA Run 29"}, last_world_joined: {relative: true, path: "saves/AA Run 29"}}));
const cut = Number(mins) * 60000;
let lines = fs.readFileSync(log, "utf8").split("\n").filter(Boolean).filter(l => { const g = l.lastIndexOf('"igt":'); return g < 0 || parseInt(l.slice(g + 6)) <= cut; });
// a no-reset log closes when the world is left: cut off any close at the end so the world looks open
while (lines.length && /"type":"(close|server_shutdown)"/.test(lines[lines.length - 1])) lines.pop();
if (paused) lines.push(`{"time":0,"type":"screen","data":{"class":"x","title":{"translate":"menu.game"},"is_pause":true},"speedrunigt":{"rta":0,"igt":${cut}}}`);
else lines.push(`{"time":0,"type":"screen","data":{"class":null,"title":null,"is_pause":false},"speedrunigt":{"rta":0,"igt":${cut}}}`);
const lastT = Math.max(...lines.map(l => parseInt(l.slice(8)) || 0)), shift = Date.now() - lastT;
lines = lines.map(l => l.replace(/^\{"time":(\d+)/, (m, t) => `{"time":${+t === 0 ? Date.now() : +t + shift}`));
const out = Buffer.concat(lines.map(l => { const b = Buffer.from(l); rotate(b); return Buffer.concat([b, Buffer.from("\n")]); }));
fs.writeFileSync(path.join(world, "hermes/restricted/play.log.enc"), out);
console.log("wrote", lines.length, "lines up to", mins, "min");
