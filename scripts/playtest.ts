// M14 playtest harness. Runs random-vs-random self-play over every registered
// scenario and prints per-scenario balance stats. Run on demand (NOT part of the
// test suite): `pnpm playtest [games]` (default 1000). Reproducible: game i uses
// seed i, so the whole table is byte-identical across runs.
//
// Limit to specific scenarios (targeted playtesting / avoid timeouts) with
// `--scenario=<id>[,<id>...]`, e.g. `pnpm playtest 500 --scenario=paoli`.
import { SCENARIOS } from '../src/lib/game/data/scenarios';
import {
	runGame,
	randomPolicy,
	heuristicPolicy,
	smartHeuristicPolicy,
	type GameOutcome,
	type Policy
} from '../src/lib/game/sim/playout';
import { mulberry32 } from '../src/lib/game/core/rng';
import { mechanicStats, formatMechanicStats } from '../src/lib/game/sim/report';

const args = process.argv.slice(2);
const N = Number(args.find((a) => /^\d+$/.test(a))) || 1000;
const onlyArg = args.find((a) => a.startsWith('--scenario='))?.slice('--scenario='.length);
const only = onlyArg ? onlyArg.split(',').map((s) => s.trim()) : null;
if (only) {
	const unknown = only.filter((id) => !SCENARIOS[id]);
	if (unknown.length) {
		console.error(`Unknown scenario(s): ${unknown.join(', ')}`);
		console.error(`Available: ${Object.keys(SCENARIOS).join(', ')}`);
		process.exit(1);
	}
}
const scenarios = only ? only.map((id) => SCENARIOS[id]) : Object.values(SCENARIOS);

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => {
	const s = [...xs].sort((a, b) => a - b);
	const m = Math.floor(s.length / 2);
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (n: number) => `${((100 * n) / N).toFixed(1)}%`;

function report(label: string, scenario: (typeof SCENARIOS)[string], blue: Policy, red: Policy) {
	const games: GameOutcome[] = Array.from({ length: N }, (_, seed) =>
		runGame(scenario, blue, red, mulberry32(seed))
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
	// Army-wipe rate: games where one side was eliminated *entirely* (0 total SP).
	// Distinct from per-unit casualties below — this is total annihilation, which is
	// rare when games end at the turn limit or on a victory condition first.
	const wipe = games.filter((g) => Math.min(...g.survivingSpByPlayer) === 0).length;

	console.log(`  [${label}]`);
	console.log(
		`    win blue (P0): ${pct(wins[0])}   win red (P1): ${pct(wins[1])}   draw: ${pct(draws)}`
	);
	console.log(`    turns: mean ${mean(turns).toFixed(1)}, median ${median(turns)}`);
	console.log(`    surviving SP: blue ${mean(sp0).toFixed(1)}, red ${mean(sp1).toFixed(1)}`);
	console.log(`    army-wipe rate: ${pct(wipe)}`);
	console.log(formatMechanicStats(mechanicStats(games)));
}

// Paired-mirror A/B: smart vs baseline on the same seeds, each policy playing
// each side once, so a scenario's side bias (see White Plains) cancels out.
// Reports the challenger's net edge over the incumbent — the verdict on whether a
// change helps. Default call is default-smart vs the naive baseline; to sweep a
// *tuning* change, pass `makeSmartPolicy({ ...DEFAULT_SMART_TUNING, finishBonus: 0.7 })`
// as the challenger and `smartHeuristicPolicy` as the incumbent (see the loop below).
function abReport(
	label: string,
	scenario: (typeof SCENARIOS)[string],
	challenger: Policy,
	incumbent: Policy
) {
	let spEdge = 0;
	let challengerWins = 0;
	let incumbentWins = 0;
	let draws = 0;
	const tally = (g: GameOutcome, challengerPlayer: 0 | 1) => {
		spEdge += g.survivingSpByPlayer[challengerPlayer] - g.survivingSpByPlayer[1 - challengerPlayer];
		if (g.outcome?.status === 'won' && g.outcome.winner !== null) {
			if (g.outcome.winner === challengerPlayer) challengerWins++;
			else incumbentWins++;
		} else draws++;
	};
	for (let seed = 0; seed < N; seed++) {
		tally(runGame(scenario, challenger, incumbent, mulberry32(seed)), 0);
		tally(runGame(scenario, incumbent, challenger, mulberry32(seed)), 1);
	}
	const g = 2 * N;
	const edge = spEdge / g;
	console.log(`  [A/B: ${label} · paired mirror]`);
	console.log(
		`    challenger win ${((100 * challengerWins) / g).toFixed(1)}%   incumbent win ${((100 * incumbentWins) / g).toFixed(1)}%   draw ${((100 * draws) / g).toFixed(1)}%`
	);
	console.log(
		`    challenger net surviving-SP edge: ${edge >= 0 ? '+' : ''}${edge.toFixed(2)} per game`
	);
}

console.log(`Playtest: ${N} games/scenario (seed i per game i)\n`);

for (const scenario of scenarios) {
	console.log(`── ${scenario.name} (${scenario.id}, turnLimit ${scenario.turnLimit}) ──`);
	report('random vs random', scenario, randomPolicy, randomPolicy);
	report('baseline vs baseline', scenario, heuristicPolicy, heuristicPolicy);
	report('smart vs smart', scenario, smartHeuristicPolicy, smartHeuristicPolicy);
	abReport('smart vs baseline', scenario, smartHeuristicPolicy, heuristicPolicy);
	console.log('');
}
