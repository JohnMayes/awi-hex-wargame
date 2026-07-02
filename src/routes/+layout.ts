// SPA build: render client-side only. There is no server surface, and the LittleJS
// board can only run in the browser (it's gated behind onMount + a dynamic import).
// adapter-static emits the fallback shell (index.html) that boots this client app.
export const ssr = false;
