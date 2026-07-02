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

		// Play launches the chosen scenario.
		await page.getByRole('button', { name: 'Play' }).click();
		expect(onPlay).toHaveBeenCalledWith(PITCHED_BATTLE);
	});
});
