// Seedable PRNG (mulberry32). Same seed → identical `() => number` stream, so a
// fixed seed reproduces a whole game exactly. The store threads `() => number`
// through every stochastic mutator; this just makes that source deterministic.
export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
