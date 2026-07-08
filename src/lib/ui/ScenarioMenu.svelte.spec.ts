import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { PITCHED_BATTLE } from '$lib/game/data/scenarios';
import ScenarioMenu from './ScenarioMenu.svelte';

describe('ScenarioMenu', () => {
	it('New Game reveals the scenario list, a card shows detail, Play fires onPlay', async () => {
		expect.assertions(4);
		const onPlay = vi.fn();
		render(ScenarioMenu, { onPlay });

		// Home → list.
		await page.getByRole('button', { name: 'New Game' }).click();
		const card = page.getByRole('button', { name: new RegExp(PITCHED_BATTLE.name, 'i') });
		await expect.element(card).toBeInTheDocument();

		// List → detail: the scenario blurb and a victory-condition line render.
		await card.click();
		await expect.element(page.getByText(PITCHED_BATTLE.description)).toBeInTheDocument();
		// Pitched Battle is symmetric, so this objective renders for both sides — .first().
		const firstObjective = PITCHED_BATTLE.victoryConditions[0].description;
		await expect.element(page.getByText(firstObjective).first()).toBeInTheDocument();

		// Play launches the chosen scenario. Default control: Blue human, Red AI.
		await page.getByRole('button', { name: 'Play' }).click();
		expect(onPlay).toHaveBeenCalledWith(PITCHED_BATTLE, [1]);
	});

	it('per-side toggles set which players are AI in the onPlay payload', async () => {
		expect.assertions(2);
		const onPlay = vi.fn();
		render(ScenarioMenu, { onPlay });

		await page.getByRole('button', { name: 'New Game' }).click();
		await page.getByRole('button', { name: new RegExp(PITCHED_BATTLE.name, 'i') }).click();

		// Defaults: Blue = Human, Red = AI. Flip both → Blue AI, Red Human.
		await page.getByRole('button', { name: 'Blue: Human' }).click();
		await page.getByRole('button', { name: 'Red: AI' }).click();
		await expect.element(page.getByRole('button', { name: 'Blue: AI' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Play' }).click();
		expect(onPlay).toHaveBeenCalledWith(PITCHED_BATTLE, [0]);
	});

	// Regression: the menu is shown *without* a mounted board, but the engine's
	// document input listeners outlive any prior board and would preventDefault the
	// synthesized click (dead menu buttons on touch after returning from a game).
	// The menu root must swallow press/release events like the game chrome does.
	it('swallows press/release events so they never reach document', async () => {
		expect.assertions(4);
		render(ScenarioMenu, { onPlay: vi.fn() });
		const el = page.getByRole('button', { name: 'New Game' }).element();

		for (const type of ['mousedown', 'mouseup', 'touchstart', 'touchend']) {
			const spy = vi.fn();
			document.addEventListener(type, spy);
			el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
			document.removeEventListener(type, spy);
			expect(spy, `${type} should be swallowed before document`).not.toHaveBeenCalled();
		}
	});
});
