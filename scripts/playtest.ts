// M14 playtest harness. Runs random-vs-random self-play over every registered
// scenario and prints per-scenario balance stats. Run on demand (NOT part of the
// test suite): `pnpm playtest [games]` (default 1000). Reproducible: game i uses
// seed i, so the whole table is byte-identical across runs.
import { SCENARIOS } from '../src/lib/game/data/scenarios';
import { runGame, randomPolicy, type GameOutcome } from '../src/lib/game/sim/playout';
import { mulberry32 } from '../src/lib/game/core/rng';

const N = Number(process.argv[2]) || 1000;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => {
	const s = [...xs].sort((a, b) => a - b);
	const m = Math.floor(s.length / 2);
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (n: number) => `${((100 * n) / N).toFixed(1)}%`;

console.log(`Playtest: random vs random, ${N} games/scenario (seed i per game i)\n`);

for (const scenario of Object.values(SCENARIOS)) {
	const games: GameOutcome[] = Array.from({ length: N }, (_, seed) =>
		runGame(scenario, randomPolicy, randomPolicy, mulberry32(seed))
	);

	const wins = [0, 0];
	let draws = 0;
	for (const g of games) {
		if (g.outcome?.status === 'won' && g.outcome.winner !== null) wins[g.outcome.winner]++;
		else draws++;
	}
	const turns = games.map((g) => g.turns);
	const sp0 = games.map((g) => g.survivingSpByPlayer[0]);
	const sp1 = games.map((g) => g.survivingSpByPlayer[1]);
	// Elimination rate: games where at least one side was wiped out entirely.
	const elim = games.filter((g) => Math.min(...g.survivingSpByPlayer) === 0).length;

	console.log(`── ${scenario.name} (${scenario.id}, turnLimit ${scenario.turnLimit}) ──`);
	console.log(
		`  win blue (P0): ${pct(wins[0])}   win red (P1): ${pct(wins[1])}   draw: ${pct(draws)}`
	);
	console.log(`  turns: mean ${mean(turns).toFixed(1)}, median ${median(turns)}`);
	console.log(`  surviving SP: blue ${mean(sp0).toFixed(1)}, red ${mean(sp1).toFixed(1)}`);
	console.log(`  elimination rate: ${pct(elim)}\n`);
}
