// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isEditableTarget, type KeyInput, shortcutFor } from "./shortcuts.js";

const key = (k: string, mods: Partial<KeyInput> = {}): KeyInput => ({
	key: k,
	shiftKey: false,
	altKey: false,
	ctrlKey: false,
	metaKey: false,
	...mods,
});

describe("shortcutFor", () => {
	it.each([
		[key(" "), { type: "toggle" }],
		[key("ArrowLeft"), { type: "step", frames: -1 }],
		[key("ArrowRight"), { type: "step", frames: 1 }],
		[key("ArrowLeft", { shiftKey: true }), { type: "stepSeconds", seconds: -1 }],
		[key("ArrowRight", { shiftKey: true }), { type: "stepSeconds", seconds: 1 }],
		[key("Home"), { type: "first" }],
		[key("End"), { type: "last" }],
		[key("j"), { type: "play", direction: -1 }],
		[key("K"), { type: "pause" }],
		[key("l"), { type: "play", direction: 1 }],
		[key("i"), { type: "setIn" }],
		[key("o"), { type: "setOut" }],
		[key("x"), { type: "clearRange" }],
	])("maps %j", (input, action) => {
		expect(shortcutFor(input)).toEqual(action);
	});

	it("leaves browser and unrelated keys alone", () => {
		expect(shortcutFor(key("l", { metaKey: true }))).toBeNull();
		expect(shortcutFor(key("ArrowRight", { ctrlKey: true }))).toBeNull();
		expect(shortcutFor(key("I", { shiftKey: true }))).toBeNull();
		expect(shortcutFor(key("a"))).toBeNull();
	});
});

describe("isEditableTarget", () => {
	it("recognises text fields but not buttons or checkboxes", () => {
		const make = (html: string) => {
			const wrapper = document.createElement("div");
			wrapper.innerHTML = html;
			return wrapper.firstElementChild;
		};
		expect(isEditableTarget(make("<textarea></textarea>"))).toBe(true);
		expect(isEditableTarget(make('<input type="text">'))).toBe(true);
		expect(isEditableTarget(make("<input>"))).toBe(true);
		expect(isEditableTarget(make("<select></select>"))).toBe(true);
		expect(isEditableTarget(make('<input type="checkbox">'))).toBe(false);
		expect(isEditableTarget(make("<button></button>"))).toBe(false);
		expect(isEditableTarget(null)).toBe(false);
	});
});
