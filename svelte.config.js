import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// Static SPA build (ssr disabled in src/routes/+layout.ts). The fallback shell lets
		// a native shell (Tauri/Capacitor) serve the app from the filesystem, and works on
		// any static web host too. index.html (not 200.html) is what file://-served shells expect.
		// See docs/native-mobile-readiness.md.
		adapter: adapter({ fallback: 'index.html' })
	},
	onwarn: (warning, handler) => {
		if (warning.code.includes('a11y')) {
			return;
		}
		// Handle all other warnings normally
		handler(warning);
	}
};

export default config;
