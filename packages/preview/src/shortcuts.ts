/** What a keyboard shortcut does. */
export type ShortcutAction =
	| { type: "toggle" }
	| { type: "pause" }
	| { type: "play"; direction: 1 | -1 }
	| { type: "step"; frames: number }
	| { type: "stepSeconds"; seconds: number }
	| { type: "first" }
	| { type: "last" }
	| { type: "setIn" }
	| { type: "setOut" }
	| { type: "clearRange" };

/** The fields of a keyboard event the shortcuts read. */
export interface KeyInput {
	key: string;
	shiftKey: boolean;
	altKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
}

/** The shortcuts, in the order the page lists them. */
export const SHORTCUTS: ReadonlyArray<{ keys: string[]; label: string }> = [
	{ keys: ["Space"], label: "Play / pause" },
	{ keys: ["←", "→"], label: "Previous / next frame" },
	{ keys: ["Shift", "←/→"], label: "Back / forward one second" },
	{ keys: ["J", "K", "L"], label: "Play backwards / pause / play" },
	{ keys: ["Home", "End"], label: "First / last frame" },
	{ keys: ["I", "O"], label: "Set loop in / out point" },
	{ keys: ["X"], label: "Clear the loop range" },
];

/**
 * Maps a key press to a preview action, or null when the key is not a shortcut. Presses with
 * Ctrl, Alt or Meta are left to the browser.
 */
export function shortcutFor(input: KeyInput): ShortcutAction | null {
	if (input.ctrlKey || input.altKey || input.metaKey) return null;
	switch (input.key) {
		case " ":
			return { type: "toggle" };
		case "ArrowLeft":
			return input.shiftKey ? { type: "stepSeconds", seconds: -1 } : { type: "step", frames: -1 };
		case "ArrowRight":
			return input.shiftKey ? { type: "stepSeconds", seconds: 1 } : { type: "step", frames: 1 };
		case "Home":
			return { type: "first" };
		case "End":
			return { type: "last" };
	}
	if (input.shiftKey) return null;
	switch (input.key.toLowerCase()) {
		case "j":
			return { type: "play", direction: -1 };
		case "k":
			return { type: "pause" };
		case "l":
			return { type: "play", direction: 1 };
		case "i":
			return { type: "setIn" };
		case "o":
			return { type: "setOut" };
		case "x":
			return { type: "clearRange" };
	}
	return null;
}

/** True when keys typed into `target` belong to a text field, not to the shortcuts. */
export function isEditableTarget(target: EventTarget | null): boolean {
	if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	const tag = target.tagName;
	if (tag === "TEXTAREA" || tag === "SELECT") return true;
	if (tag !== "INPUT") return false;
	const type = (target as HTMLInputElement).type;
	return !["button", "checkbox", "radio", "range", "submit", "reset"].includes(type);
}
