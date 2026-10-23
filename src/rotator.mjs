/*
 * Reads Hermes' live play log (saves/<world>/hermes/restricted/play.log.enc). A port of Hermes' Rotator
 * (me.duncanruns.hermes.rot.Rotator); Hermes asks that its warning comes along with any copy used for live data:
 *
 * WARNING: USING CIPHERED DATA DURING THE RUN IS NOT ALLOWED, PLEASE CONTACT THE SPEEDRUN.COM/MC MODERATION TEAM IF YOU
 * WANT TO USE CIPHERED DATA.
 *
 * (So runs timed with this aren't for submitting to speedrun.com.)
 *
 * Each line is scrambled on its own: every printable character is swapped for another (a shuffled alphabet, shifted
 * by half its length, so doing it twice gives the character back) and then pairs of bytes from the two ends are
 * swapped. Doing the same thing again unscrambles it.
 */
const CHARS = "!\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
const SEED = 7499203634667178692n;

// java.util.Random, as far as the shuffle needs it
function javaRandom(seed) {
  const M = (1n << 48n) - 1n;
  let s = (seed ^ 0x5DEECE66Dn) & M;
  const next = bits => { s = (s * 0x5DEECE66Dn + 0xBn) & M; return Number(BigInt.asIntN(32, s >> (48n - BigInt(bits)))); };
  return bound => {
    if ((bound & -bound) === bound) return Number((BigInt(bound) * BigInt(next(31))) >> 31n);
    let bits, val;
    do { bits = next(31); val = bits % bound; } while (bits - val + (bound - 1) < 0 || bits - val + (bound - 1) > 0x7fffffff);
    return val;
  };
}

const SWAP = (() => {
  const pool = [...Buffer.from(CHARS)], chars = [], rnd = javaRandom(SEED);
  while (pool.length) chars.push(pool.splice(rnd(pool.length), 1)[0]);
  const shift = chars.length / 2, swap = new Uint8Array(256).map((_, i) => i);
  chars.forEach((c, i) => { swap[c] = chars[(i + shift) % chars.length]; });
  return swap;
})();

// Scrambles or unscrambles one line (the bytes between two newlines), in place
export function rotate(bytes, length = bytes.length) {
  for (let i = 0; i < length; i++) bytes[i] = SWAP[bytes[i]];
  for (let i = 0; i < length / 2; i += 2) { const j = length - 1 - i, t = bytes[i]; bytes[i] = bytes[j]; bytes[j] = t; }
  return bytes;
}
