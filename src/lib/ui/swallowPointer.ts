// Pointer-events discipline for DOM chrome overlaid on the body-rooted LittleJS
// canvas. Stops chrome presses AND releases from bubbling to `document`, where
// LittleJS's input listeners live (attached in engineInit, never removable).
// Stopping the *down* events keeps chrome taps from registering as board input;
// stopping the *up* events matters on touch, where the engine's `touchend`
// handler calls `preventDefault()` — which would cancel the synthesized `click`
// and leave every chrome button/radio/dialog dead to touch. Those document
// listeners outlive any unmounted board (the engine is a page-lifetime
// singleton), so screens shown *without* a mounted board (the menu) need this
// too. The element's own `onclick`/`onchange` is a separate event and still fires.
// An attachment (not inline handlers) keeps the static container free of a11y warnings.
const SWALLOWED = ['mousedown', 'mouseup', 'touchstart', 'touchend'] as const;

export function swallowPointer(node: HTMLElement) {
	const stop = (e: Event) => e.stopPropagation();
	for (const type of SWALLOWED) node.addEventListener(type, stop);
	return () => {
		for (const type of SWALLOWED) node.removeEventListener(type, stop);
	};
}
