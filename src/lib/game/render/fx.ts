import type { GameStore } from '$lib/game/state/gameStore.svelte';
import type {
	ChargeActionEvent,
	FireActionEvent,
	LogEvent,
	ReinforcementsArrivedEvent,
	UnitExitedEvent
} from '../core/log';
import { hexToRgb, type Rgb } from './terrainStyle';

/**
 * Transient feedback — the M13 feedback layer and the single renderer for
 * "otherwise-invisible" outcomes. The render loop calls `syncFx` each frame to
 * turn newly-appended `store.log` events (fire/charge results, and a failed
 * command check on activation_started) into transient text, and `drawFx` to
 * render the live ones. This is the sole feedback channel — there is no separate
 * store.notice / DOM toast.
 *
 * Rendered as **screen-centered** text (not over the hex) for legibility and to
 * keep it clear of the screen edges. When one combat resolves into several
 * results (e.g. step loss, morale break, elimination) they play **one at a
 * time**, queued sequentially, rather than stacking — easier to read.
 *
 * A pure store consumer: it only *reads* `store.log` (LJS pulls; Svelte pushes,
 * per `render/CLAUDE.md`). Engine-free at module scope (no `littlejsengine`
 * import) so this file is SSR-safe; `engine.ts` passes `LJS` into `drawFx`.
 */
type LJSModule = typeof import('littlejsengine');

type FxFloat = {
	text: string;
	color: Rgb;
	spawn: number; // LJS.time (seconds) this message starts showing
};

type FxLine = { text: string; color: Rgb };

const MESSAGE_TIME = 1.5; // seconds each message is shown before the next
const SIZE_FRAC = 0.046; // text height as a fraction of canvas height
const MAXWIDTH_FRAC = 0.9; // cap text width to this fraction of the canvas (no overflow)
const RISE_FRAC = 0.05; // how far a message drifts up over its life
const HOLD = 0.6; // fraction of life held at full opacity before fading
const OUTLINE: Rgb = { r: 0.04, g: 0.01, b: 0.01 };

const COLOR_DAMAGE = hexToRgb('#ff5555');
const COLOR_MISS = hexToRgb('#cfc8b8');
const COLOR_MORALE = hexToRgb('#e0a324');
const COLOR_LEADER = hexToRgb('#ffd700');
const COLOR_ELIM = hexToRgb('#ff2d2d');
const COLOR_REINFORCE = hexToRgb('#5fd35f');
const COLOR_EXIT = hexToRgb('#ffd166');

let floats: FxFloat[] = [];
let lastLogIndex = 0;
let nextSlot = 0; // earliest LJS.time the next queued message may appear

/** Drop all live floats and skip past the existing log so a (re)mount never
 *  replays history as a burst. Call from `mountBoard`. */
export function resetFx(store: GameStore) {
	floats = [];
	lastLogIndex = store.log.length;
	nextSlot = 0;
}

function fireLines(e: FireActionEvent): FxLine[] {
	const r = e.result;
	const lines: FxLine[] = [];
	if (!r.hit) lines.push({ text: 'MISS', color: COLOR_MISS });
	else if (r.damage > 0) lines.push({ text: `-${r.damage} SP`, color: COLOR_DAMAGE });
	if (r.morale && !r.morale.passed) lines.push({ text: 'MORALE BROKEN', color: COLOR_MORALE });
	if (r.leaderCasualty?.casualty) lines.push({ text: 'LEADER DOWN', color: COLOR_LEADER });
	if (r.eliminatedUnitIds.includes(r.targetId))
		lines.push({ text: 'ELIMINATED', color: COLOR_ELIM });
	return lines;
}

function chargeLines(e: ChargeActionEvent): FxLine[] {
	const r = e.result;
	const lines: FxLine[] = [];
	if (r.defenderDamage > 0)
		lines.push({ text: `DEFENDER -${r.defenderDamage} SP`, color: COLOR_DAMAGE });
	if (r.attackerDamage > 0)
		lines.push({ text: `ATTACKER -${r.attackerDamage} SP`, color: COLOR_DAMAGE });
	if (r.morale && !r.morale.passed) lines.push({ text: 'MORALE BROKEN', color: COLOR_MORALE });
	if (r.defenderLeaderCasualty?.casualty || r.attackerLeaderCasualty?.casualty)
		lines.push({ text: 'LEADER DOWN', color: COLOR_LEADER });
	if (r.eliminatedUnitIds.length) lines.push({ text: 'ELIMINATED', color: COLOR_ELIM });
	return lines;
}

/** Queue lines to play one at a time, each starting after the previous finishes.
 *  `nextSlot` serializes across events too, so back-to-back combats don't overlap. */
function enqueue(lines: FxLine[], now: number) {
	for (const line of lines) {
		const spawn = Math.max(now, nextSlot);
		floats.push({ text: line.text, color: line.color, spawn });
		nextSlot = spawn + MESSAGE_TIME;
	}
}

function exitLines(e: UnitExitedEvent): FxLine[] {
	const side = e.player === 0 ? 'BLUE' : 'RED';
	return [{ text: `${side} UNIT ESCAPED`, color: COLOR_EXIT }];
}

function reinforcementLines(e: ReinforcementsArrivedEvent): FxLine[] {
	if (e.units.length === 0) return [];
	const side = e.player === 0 ? 'BLUE' : 'RED';
	const n = e.units.length;
	return [
		{ text: `${side} REINFORCEMENTS — ${n} UNIT${n === 1 ? '' : 'S'}`, color: COLOR_REINFORCE }
	];
}

function spawnForEvent(event: LogEvent, now: number) {
	if (event.kind === 'fire_action') enqueue(fireLines(event), now);
	else if (event.kind === 'charge_action') enqueue(chargeLines(event), now);
	else if (event.kind === 'activation_started' && !event.commandCheck.passed)
		enqueue([{ text: 'OUT OF COMMAND', color: COLOR_MORALE }], now);
	else if (event.kind === 'reinforcements_arrived') enqueue(reinforcementLines(event), now);
	else if (event.kind === 'unit_exited') enqueue(exitLines(event), now);
}

/** Turn any log events appended since the last call into floats. */
export function syncFx(store: GameStore, now: number) {
	const log = store.log;
	// Guard against a log reset (clearLog) shrinking the array.
	if (lastLogIndex > log.length) lastLogIndex = 0;
	for (let i = lastLogIndex; i < log.length; i++) spawnForEvent(log[i], now);
	lastLogIndex = log.length;
}

/** Draw the current message as screen-centered HUD text. Queued messages with a
 *  future `spawn` wait their turn; finished ones are dropped. */
export function drawFx(LJS: LJSModule) {
	const now = LJS.time;
	floats = floats.filter((f) => now - f.spawn < MESSAGE_TIME); // drop finished, keep pending
	if (!floats.length) return;

	const cw = LJS.mainCanvasSize.x;
	const ch = LJS.mainCanvasSize.y;
	const size = ch * SIZE_FRAC;
	const rise = ch * RISE_FRAC;
	const maxWidth = cw * MAXWIDTH_FRAC;

	for (const f of floats) {
		if (now < f.spawn) continue; // not its turn yet
		const p = (now - f.spawn) / MESSAGE_TIME;
		// Hold full opacity, then fade over the tail.
		const alpha = p < HOLD ? 1 : Math.max(0, 1 - (p - HOLD) / (1 - HOLD));
		LJS.drawTextScreen(
			f.text,
			LJS.vec2(cw / 2, ch / 2 - p * rise),
			size,
			LJS.rgb(f.color.r, f.color.g, f.color.b, alpha),
			size * 0.14,
			LJS.rgb(OUTLINE.r, OUTLINE.g, OUTLINE.b, alpha),
			'center',
			undefined,
			undefined,
			maxWidth
		);
	}
}
