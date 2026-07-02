<script lang="ts">
	import { initGameStore, resetGameStore, type GameStore } from '$lib/game/state/gameStore.svelte';
	import type { Scenario } from '$lib/game/core/scenario';
	import ScenarioMenu from '$lib/ui/ScenarioMenu.svelte';
	import GameScreen from '$lib/ui/GameScreen.svelte';

	// App shell: main menu → scenario pick → board. No routing — module singletons
	// and the un-tearable LittleJS engine persist across client navigations anyway,
	// so a screen flag is simpler and suits the SPA/native model.
	let view = $state<'menu' | 'game'>('menu');
	let activeStore = $state<GameStore | null>(null);

	// `initGameStore` returns the cached singleton, so reset first to start a fresh
	// game. Remounting <LittleBoard> with the new store swaps the engine's currentStore.
	function launch(scenario: Scenario) {
		resetGameStore();
		activeStore = initGameStore(scenario);
		view = 'game';
	}

	// Return to the menu. The in-progress game is replaced on the next launch (no resume yet).
	function exit() {
		view = 'menu';
	}
</script>

{#if view === 'menu'}
	<ScenarioMenu onPlay={launch} />
{:else if activeStore}
	<GameScreen store={activeStore} onExit={exit} />
{/if}
