import { describe, expect, it, vi } from 'vitest';
import { drawFx, resetFx, syncFx } from './fx';
import type { ActivationStartedEvent, FireActionEvent } from '../core/log';
import type { GameStore } from '$lib/game/state/gameStore.svelte';

// fx.ts is engine-free at runtime (only type-imports LittleJS/GameStore), so it
// unit-tests in Node with a mock LJS namespace and a minimal store stand-in.

const CW = 800;
const CH = 1000;

function mockLJS(time: number) {
	return {
		time,
		mainCanvasSize: { x: CW, y: CH },
		vec2: (x: number, y: number) => ({ x, y }),
		rgb: (r: number, g: number, b: number, a: number) => ({ r, g, b, a }),
		drawTextScreen: vi.fn()
	};
}

// A fire that hit for 2 SP and broke morale → two feedback lines.
function fireEvent(): FireActionEvent {
	return {
		kind: 'fire_action',
		turn: 1,
		player: 0,
		targetCoords: { col: 1, row: 1 },
		result: {
			hit: true,
			damage: 2,
			morale: { passed: false },
			leaderCasualty: null,
			eliminatedUnitIds: [],
			targetId: 'red-1'
		}
	} as unknown as FireActionEvent;
}

// A command check: failed checks surface as feedback, passed ones do not.
function activationEvent(passed: boolean): ActivationStartedEvent {
	return {
		kind: 'activation_started',
		turn: 1,
		player: 0,
		unitId: 'blue-1',
		commandCheck: { passed }
	} as unknown as ActivationStartedEvent;
}

const storeWith = (log: unknown[]) => ({ log }) as unknown as GameStore;

describe('combat FX (M13)', () => {
	it('spawns screen-centered, large feedback text for a fire event', () => {
		expect.assertions(5);
		const store = storeWith([]);
		resetFx(store);
		(store.log as unknown[]).push(fireEvent());
		syncFx(store, 0);

		// At t=0 only the first of the two results shows (one at a time).
		const first = mockLJS(0);
		drawFx(first as never);
		expect(first.drawTextScreen).toHaveBeenCalledTimes(1);
		const [text, pos, size, , , , , , , maxWidth] = first.drawTextScreen.mock.calls[0];
		expect(text).toBe('-2 SP');
		expect(pos.x).toBe(CW / 2); // horizontally centered
		expect(size).toBeGreaterThan(CH * 0.03); // sized to a fraction of canvas height
		expect(maxWidth).toBeLessThanOrEqual(CW); // width-capped so it can't overflow
	});

	it('plays the next message only after the previous one finishes', () => {
		expect.assertions(2);
		const store = storeWith([]);
		resetFx(store);
		(store.log as unknown[]).push(fireEvent());
		syncFx(store, 0);

		// Halfway through the first message: still only the first.
		const mid = mockLJS(0.5);
		drawFx(mid as never);
		expect(mid.drawTextScreen.mock.calls[0][0]).toBe('-2 SP');

		// After the first message's slot: the second ("MORALE BROKEN") plays.
		const next = mockLJS(1.6);
		drawFx(next as never);
		expect(next.drawTextScreen.mock.calls[0][0]).toBe('MORALE BROKEN');
	});

	it('expires messages after their time so they leave the screen', () => {
		expect.assertions(2);
		const store = storeWith([]);
		resetFx(store);
		(store.log as unknown[]).push(fireEvent());
		syncFx(store, 0);

		const stillUp = mockLJS(0.5); // first message on screen
		drawFx(stillUp as never);
		expect(stillUp.drawTextScreen).toHaveBeenCalled();

		const expired = mockLJS(10); // both messages long gone
		drawFx(expired as never);
		expect(expired.drawTextScreen).not.toHaveBeenCalled();
	});

	it('surfaces a failed command check (out of command)', () => {
		expect.assertions(2);
		const store = storeWith([]);
		resetFx(store);
		(store.log as unknown[]).push(activationEvent(false));
		syncFx(store, 0);
		const ljs = mockLJS(0);
		drawFx(ljs as never);
		expect(ljs.drawTextScreen).toHaveBeenCalledTimes(1);
		expect(ljs.drawTextScreen.mock.calls[0][0]).toBe('OUT OF COMMAND');
	});

	it('shows nothing for a passed command check', () => {
		expect.assertions(1);
		const store = storeWith([]);
		resetFx(store);
		(store.log as unknown[]).push(activationEvent(true));
		syncFx(store, 0);
		const ljs = mockLJS(0);
		drawFx(ljs as never);
		expect(ljs.drawTextScreen).not.toHaveBeenCalled();
	});

	it('replays nothing already in the log at reset time', () => {
		expect.assertions(1);
		const store = storeWith([fireEvent(), fireEvent()]);
		resetFx(store); // skip past existing history
		syncFx(store, 0);
		const ljs = mockLJS(0);
		drawFx(ljs as never);
		expect(ljs.drawTextScreen).not.toHaveBeenCalled();
	});
});
