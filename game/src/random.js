// EMBERWOK — random.js
// The only source of randomness in the simulation. Seeded, deterministic:
// the same seed + the same input sequence always replays the same night.
// Nothing in here touches Date.now() or Math.random().

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this._next = mulberry32(this.seed);
    this.calls = 0; // how many draws have been made (debugging / replays)
  }

  // Float in [0, 1).
  next() {
    this.calls += 1;
    return this._next();
  }

  // Float in [a, b). With one argument, range(n) means [0, n).
  range(a, b) {
    if (b === undefined) {
      b = a;
      a = 0;
    }
    return a + this.next() * (b - a);
  }

  // Integer in [a, b] inclusive. With one argument, int(n) means [0, n].
  int(a, b) {
    if (b === undefined) {
      b = a;
      a = 0;
    }
    return Math.floor(this.range(a, b + 1));
  }

  // Uniform pick from a non-empty array; null for an empty one.
  pick(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(this.next() * arr.length)];
  }

  // True with probability p (0..1).
  chance(p) {
    return this.next() < p;
  }

  // Fisher-Yates shuffle that returns a NEW array (input untouched).
  shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }
}
