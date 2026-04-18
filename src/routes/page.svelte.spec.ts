import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

describe('/+page.svelte', () => {
	it('should render the game SVG', async () => {
		render(Page);

		const svg = page.getByRole('img', { includeHidden: true });
		await expect.element(svg).toBeInTheDocument();
	});
});
