import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { resetGameStore } from '$lib/game/state/gameStore.svelte';

// As of R6 the default renderer is LittleJS, so `render(Page)` takes the LJS
// branch. Mounting the real engine in headless Chromium would start an
// unstoppable RAF loop, attach document listeners, and request WebGL — none of
// which we want in a chrome test. Mock the engine to no-ops so this exercises
// only the DOM overlay (the canvas board is covered by the render/ Node specs).
vi.mock('$lib/game/render/engine', () => ({
	mountBoard: () => Promise.resolve(),
	unmountBoard: () => {}
}));

import Page from './+page.svelte';

describe('/+page.svelte (LittleJS default)', () => {
	// The store is a module singleton; reset so each test starts from Blue's turn.
	beforeEach(() => resetGameStore());

	it('overlays the DOM chrome and End Turn flips the active player', async () => {
		render(Page);

		const endTurn = page.getByRole('button', { name: 'End Turn' });
		await expect.element(endTurn).toBeInTheDocument();

		// Blue (player 0) starts; End Turn hands off to Red (player 1).
		await expect.element(page.getByText('Blue')).toBeInTheDocument();
		await endTurn.click();
		await expect.element(page.getByText('Red')).toBeInTheDocument();
	});

	it('survives unmount/remount — chrome re-renders and End Turn still flips', async () => {
		// R7: the renderer toggle (and HMR) unmount then remount the board, driving
		// mountBoard/unmountBoard. The page must compose cleanly again afterward.
		const first = render(Page);
		await expect.element(page.getByRole('button', { name: 'End Turn' })).toBeInTheDocument();
		first.unmount();

		render(Page);
		const endTurn = page.getByRole('button', { name: 'End Turn' });
		await expect.element(endTurn).toBeInTheDocument();
		await expect.element(page.getByText('Blue')).toBeInTheDocument();
		await endTurn.click();
		await expect.element(page.getByText('Red')).toBeInTheDocument();
	});
});
