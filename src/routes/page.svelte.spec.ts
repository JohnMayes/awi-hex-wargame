import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { resetGameStore } from '$lib/game/state/gameStore.svelte';

// Launching a game mounts GameScreen → LittleBoard → the engine. Mock the engine
// to no-ops so this integration test exercises only the menu→game view swap; the
// chrome behaviour itself is covered by GameScreen.svelte.spec.ts.
vi.mock('$lib/game/render/engine', () => ({
	mountBoard: () => Promise.resolve(),
	unmountBoard: () => {}
}));

import Page from './+page.svelte';

describe('/+page.svelte (app shell)', () => {
	beforeEach(() => resetGameStore());

	it('boots on the menu and New Game → scenario → Play swaps to the board', async () => {
		render(Page);

		// The menu is the landing screen — no board chrome yet.
		const newGame = page.getByRole('button', { name: 'New Game' });
		await expect.element(newGame).toBeInTheDocument();

		await newGame.click();
		await page.getByRole('button', { name: /pitched battle/i }).click();
		await page.getByRole('button', { name: 'Play' }).click();

		// Now on the game screen: the top bar's End Turn control is present.
		await expect.element(page.getByRole('button', { name: /end turn/i })).toBeInTheDocument();
	});
});
