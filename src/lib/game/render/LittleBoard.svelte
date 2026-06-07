<script lang="ts" module>
	// HMR: force a full reload on edits — the engine can't be hot-patched cleanly
	// (a partial patch would stack a second RAF loop). Mirrors LittleJS's vite-starter.
	if (import.meta.hot) import.meta.hot.accept(() => location.reload());
</script>

<script lang="ts">
	// Thin mount wrapper. All engine lifecycle + drawing lives in engine.ts; the
	// board renders to body-level canvases, so this component owns no DOM itself.
	// See src/lib/game/render/CLAUDE.md and docs/littlejs-migration-roadmap.md.
	import { onMount } from 'svelte';
	import type { GameStore } from '$lib/game/state/gameStore.svelte';
	import { mountBoard, unmountBoard } from './engine';

	let { store }: { store: GameStore } = $props();

	onMount(() => {
		void mountBoard(store);
		return () => unmountBoard();
	});
</script>
