import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { resetGameStore } from '$lib/game/state/gameStore.svelte';

// The page renders the LittleJS board plus the DOM chrome overlay. Mounting the
// real engine in headless Chromium would start an unstoppable RAF loop, attach
// document listeners, and request WebGL — none of which we want in a chrome
// test. Mock the engine to no-ops so this exercises only the DOM overlay (the
// canvas board is covered by the render/ Node specs).
vi.mock('$lib/game/render/engine', () => ({
	mountBoard: () => Promise.resolve(),
	unmountBoard: () => {}
}));

import Page from './+page.svelte';

describe('/+page.svelte (LittleJS)', () => {
	// The store is a module singleton; reset so each test starts from Blue's turn.
	beforeEach(() => resetGameStore());

	it('overlays the DOM chrome and End Turn flips the active player', async () => {
		render(Page);

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
		// mountBoard/unmountBoard. The page must compose cleanly again afterward.
		const first = render(Page);
		await expect.element(page.getByRole('button', { name: /end turn/i })).toBeInTheDocument();
		first.unmount();

		render(Page);
		const endTurn = page.getByRole('button', { name: /end turn/i });
		await expect.element(endTurn).toBeInTheDocument();
		const banner = page.getByRole('banner');
		await expect.element(banner.getByText('Blue')).toBeInTheDocument();
		// First press arms the soft-confirm (units remain), second ends the turn.
		await endTurn.click();
		await endTurn.click();
		await expect.element(banner.getByText('Red')).toBeInTheDocument();
	});
});
