/** Mulberry32 — deterministic PRNG seeded with a 32-bit integer. */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6D2B79F5) >>> 0;
    let z = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }

  /** Random integer in [min, max] inclusive. */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Pick a random element. */
  pick<T>(arr: T[]): T {
    return arr[this.nextInt(0, arr.length - 1)];
  }

  /** Fisher-Yates shuffle, returns a new array. */
  shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Random boolean with given probability of true (default 0.5). */
  bool(p = 0.5): boolean {
    return this.next() < p;
  }
}
