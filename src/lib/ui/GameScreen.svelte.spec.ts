import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { GameStore } from '$lib/game/state/gameStore.svelte';
import { PITCHED_BATTLE } from '$lib/game/data/scenarios';

// GameScreen renders the LittleJS board plus the DOM chrome overlay. Mounting the
// real engine in headless Chromium would start an unstoppable RAF loop, attach
// document listeners, and request WebGL — none of which we want in a chrome test.
// Mock the engine to no-ops so this exercises only the DOM overlay (the canvas
// board is covered by the render/ Node specs).
vi.mock('$lib/game/render/engine', () => ({
	mountBoard: () => Promise.resolve(),
	unmountBoard: () => {}
}));

import GameScreen from './GameScreen.svelte';

// fromScenario builds a fresh store per call, so no singleton reset is needed.
const props = () => ({ store: GameStore.fromScenario(PITCHED_BATTLE), onExit: () => {} });

describe('GameScreen', () => {
	it('overlays the DOM chrome and End Turn flips the active player', async () => {
		render(GameScreen, props());

		// Name matches both 'End Turn' and the armed 'End turn? (N left)' label.
		const endTurn = page.getByRole('button', { name: /end turn/i });
		await expect.element(endTurn).toBeInTheDocument();

		// Blue (player 0) starts; End Turn hands off to Red (player 1). Scope to the
		// top bar (role banner) — the objectives dialog also lists "Blue"/"Red".
		const banner = page.getByRole('banner');
		await expect.element(banner.getByText('Blue')).toBeInTheDocument();
		// Un-activated units remain, so the first press only arms the soft-confirm;
		// the second press actually ends the turn.
		await endTurn.click();
		await endTurn.click();
		await expect.element(banner.getByText('Red')).toBeInTheDocument();
	});

	it('survives unmount/remount — chrome re-renders and End Turn still flips', async () => {
		// HMR (and navigation) unmount then remount the board, driving
		// mountBoard/unmountBoard. The screen must compose cleanly again afterward.
		const first = render(GameScreen, props());
		await expect.element(page.getByRole('button', { name: /end turn/i })).toBeInTheDocument();
		first.unmount();

		render(GameScreen, props());
		const endTurn = page.getByRole('button', { name: /end turn/i });
		await expect.element(endTurn).toBeInTheDocument();
		const banner = page.getByRole('banner');
		await expect.element(banner.getByText('Blue')).toBeInTheDocument();
		// First press arms the soft-confirm (units remain), second ends the turn.
		await endTurn.click();
		await endTurn.click();
		await expect.element(banner.getByText('Red')).toBeInTheDocument();
	});

	it('☰ Menu button invokes onExit', async () => {
		expect.assertions(1);
		const onExit = vi.fn();
		render(GameScreen, { store: GameStore.fromScenario(PITCHED_BATTLE), onExit });
		await page.getByRole('button', { name: /back to menu/i }).click();
		expect(onExit).toHaveBeenCalledOnce();
	});

	// Regression: the chrome must stop press AND release events (mousedown/up,
	// touchstart/end) from reaching `document`, where the real engine's input
	// listeners live. The touchend leak in particular let the engine preventDefault
	// the synthesized click, leaving chrome buttons dead to touch.
	it('swallows chrome press/release events so they never reach document', async () => {
		expect.assertions(5); // 1 presence check + 4 swallowed event types
		render(GameScreen, props());
		const endTurn = page.getByRole('button', { name: /end turn/i });
		await expect.element(endTurn).toBeInTheDocument();
		const el = endTurn.element();

		for (const type of ['mousedown', 'mouseup', 'touchstart', 'touchend']) {
			const spy = vi.fn();
			document.addEventListener(type, spy);
			el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
			document.removeEventListener(type, spy);
			expect(spy, `${type} should be swallowed before document`).not.toHaveBeenCalled();
		}
	});
});
