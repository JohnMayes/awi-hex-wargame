// Mechanic-level metrics from the game log (M14 reporting). The playtest harness
// already reports win/turn/SP from GameOutcome's summary fields; this hooks up the
// event log so a batch also surfaces *how* games play out — fire accuracy, charge
// outcomes, morale breaks, command failures. Those are the signals rules-tuning
// needs: a rule that never fires, or fires but never matters, shows up here.
// Pure over a batch of logs; no store, no RNG.
import type { GameOutcome } from './playout';
import type { LogEvent } from '../core/log';

export type MechanicStats = {
	fire: { shots: number; hits: number; damage: number };
	charge: {
		count: number;
		defenderEliminated: number;
		defenderRetreats: number;
		defenderHolds: number;
		attackerRepulsed: number;
	};
	morale: { checks: number; breaks: number };
	command: { checks: number; failures: number };
	unitsEliminated: number;
	leadersLost: number;
	unitsExited: number;
};

const empty = (): MechanicStats => ({
	fire: { shots: 0, hits: 0, damage: 0 },
	charge: {
		count: 0,
		defenderEliminated: 0,
		defenderRetreats: 0,
		defenderHolds: 0,
		attackerRepulsed: 0
	},
	morale: { checks: 0, breaks: 0 },
	command: { checks: 0, failures: 0 },
	unitsEliminated: 0,
	leadersLost: 0,
	unitsExited: 0
});

// Fold one event into the running totals. A morale check happens whenever a
// fire/charge result carries a non-null `morale`; a break is a failed one.
function foldEvent(s: MechanicStats, e: LogEvent): void {
	switch (e.kind) {
		case 'activation_started':
			s.command.checks++;
			if (!e.commandCheck.passed) s.command.failures++;
			break;
		case 'fire_action': {
			const r = e.result;
			s.fire.shots++;
			if (r.hit) s.fire.hits++;
			s.fire.damage += r.damage;
			if (r.morale) {
				s.morale.checks++;
				if (!r.morale.passed) s.morale.breaks++;
			}
			s.unitsEliminated += r.eliminatedUnitIds.length;
			s.leadersLost += r.eliminatedLeaderIds.length;
			break;
		}
		case 'charge_action': {
			const r = e.result;
			s.charge.count++;
			if (r.outcome === 'defender_eliminated') s.charge.defenderEliminated++;
			else if (r.outcome === 'defender_retreats') s.charge.defenderRetreats++;
			else if (r.outcome === 'defender_holds') s.charge.defenderHolds++;
			else if (r.outcome === 'attacker_repulsed') s.charge.attackerRepulsed++;
			if (r.morale) {
				s.morale.checks++;
				if (!r.morale.passed) s.morale.breaks++;
			}
			s.unitsEliminated += r.eliminatedUnitIds.length;
			s.leadersLost += r.eliminatedLeaderIds.length;
			break;
		}
		case 'unit_exited':
			s.unitsExited++;
			break;
	}
}

/** Aggregate log-derived mechanic totals across a batch of games. */
export function mechanicStats(games: readonly GameOutcome[]): MechanicStats {
	const s = empty();
	for (const g of games) for (const e of g.log) foldEvent(s, e);
	return s;
}

const rate = (n: number, d: number) => (d === 0 ? '—' : `${((100 * n) / d).toFixed(1)}%`);

/** Human-readable mechanic block, indented to match the playtest harness output. */
export function formatMechanicStats(s: MechanicStats): string {
	const c = s.charge;
	return [
		`    fire: ${s.fire.shots} shots, ${rate(s.fire.hits, s.fire.shots)} hit, ${s.fire.damage} SP dealt`,
		`    charge: ${c.count} (elim ${c.defenderEliminated}, retreat ${c.defenderRetreats}, hold ${c.defenderHolds}, repulsed ${c.attackerRepulsed})`,
		`    morale: ${s.morale.checks} checks, ${rate(s.morale.breaks, s.morale.checks)} broke`,
		`    command: ${s.command.checks} checks, ${rate(s.command.failures, s.command.checks)} failed`,
		`    casualties: ${s.unitsEliminated} units, ${s.leadersLost} leaders, ${s.unitsExited} exited`
	].join('\n');
}
