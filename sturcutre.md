src/
├─ lib/
│ ├─ game/
│ │ ├─ core/ # pure logic (no Svelte)
│ │ │ ├─ terrain.ts
│ │ │ ├─ hex.ts
│ │ │ ├─ grid.ts
│ │ │ └─ types.ts
│ │ │
│ │ ├─ data/ # static data (maps, configs)
│ │ │ └─ maps.ts
│ │ │
│ │ ├─ state/ # stores / game state
│ │ │ └─ gameStore.ts
│ │ │
│ │ └─ ui/ # Svelte components
│ │ ├─ GameBoard.svelte
│ │ └─ HexTile.svelte
│ │
│ └─ ...
