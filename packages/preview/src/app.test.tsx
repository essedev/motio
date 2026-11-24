// @vitest-environment jsdom
import {
	Composition,
	delayRender,
	Folder,
	Sequence,
	Series,
	Still,
	useCurrentFrame,
} from "@motiojs/core";
import { act, type ComponentType, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewApp, type PreviewOptions } from "./app.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Frame({ title }: { title?: string }) {
	const frame = useCurrentFrame();
	return (
		<div data-testid="content" data-frame={frame}>
			{title}
		</div>
	);
}

const schema = {
	safeParse(value: unknown) {
		const title = (value as { title?: unknown }).title;
		return typeof title === "string"
			? { success: true }
			: { success: false, error: { issues: [{ path: ["title"], message: "Expected string" }] } };
	},
};

const calculateMetadata = vi.fn(({ props }: { props: Record<string, unknown> }) => ({
	durationInFrames: Number(props.seconds ?? 2) * 30,
}));

function Compositions() {
	return (
		<>
			<Composition
				id="Intro"
				component={Frame}
				width={320}
				height={180}
				fps={30}
				durationInFrames={60}
				defaultProps={{ title: "hello" }}
				schema={schema}
			/>
			<Folder name="Social">
				<Composition
					id="Story"
					component={Frame}
					width={1080}
					height={1920}
					fps={30}
					defaultProps={{ seconds: 2 }}
					calculateMetadata={calculateMetadata}
				/>
			</Folder>
		</>
	);
}

function StillAndBlink() {
	return (
		<>
			<Still id="Card" component={Frame} width={1200} height={630} />
			<Composition
				id="Blink"
				component={Frame}
				width={320}
				height={180}
				fps={30}
				durationInFrames={1}
			/>
		</>
	);
}

function Edit() {
	return (
		<>
			<Sequence name="Title" from={10} durationInFrames={20}>
				<Sequence name="Shine" from={5} durationInFrames={5} />
			</Sequence>
			<Series>
				<Series.Sequence name="One" durationInFrames={30} />
				<Series.Sequence durationInFrames={30} />
			</Series>
		</>
	);
}

function Waiting() {
	useState(() => delayRender("Waiting for the API"));
	return null;
}

function Throws() {
	if (useCurrentFrame() === 3) throw new Error("Boom at frame three");
	return null;
}

function Lab() {
	return (
		<>
			<Composition
				id="Edit"
				component={Edit}
				width={320}
				height={180}
				fps={30}
				durationInFrames={60}
			/>
			<Composition
				id="Waiting"
				component={Waiting}
				width={320}
				height={180}
				fps={30}
				durationInFrames={30}
			/>
			<Composition
				id="Throws"
				component={Throws}
				width={320}
				height={180}
				fps={30}
				durationInFrames={30}
			/>
		</>
	);
}

function BrokenRoot(): never {
	throw new Error("root exploded");
}

const OPTIONS: PreviewOptions = { stillEndpoint: null, initialProps: {}, keyboardShortcuts: true };

let host: HTMLDivElement;
let root: Root;

async function mount(component: ComponentType = Compositions, options: PreviewOptions = OPTIONS) {
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () => root.render(<PreviewApp root={component} options={options} />));
	// Let calculateMetadata resolve.
	await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}

const q = (testId: string) => host.querySelector(`[data-testid="${testId}"]`);
const text = (testId: string) => q(testId)?.textContent ?? null;

async function wait(ms: number) {
	await act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
}

async function typeProps(value: string) {
	const editor = q("props-editor") as HTMLTextAreaElement;
	const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
	await act(async () => {
		setter?.call(editor, value);
		editor.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

beforeEach(() => {
	sessionStorage.clear();
	window.history.replaceState(null, "", "/");
	calculateMetadata.mockClear();
});
afterEach(() => {
	act(() => root.unmount());
	host.remove();
});

describe("PreviewApp", () => {
	it("lists the registered compositions by folder and selects the first", async () => {
		await mount();
		const items = [...host.querySelectorAll("[data-composition-id]")];
		expect(items.map((item) => item.getAttribute("data-composition-id"))).toEqual([
			"Intro",
			"Story",
		]);
		expect(host.querySelector(".mp-folder")?.textContent).toBe("Social");
		expect(text("selected-id")).toBe("Intro");
		expect(text("composition-meta")).toBe("320×180 · 30 fps · 60 frames (2.00 s)");
		expect(window.location.hash).toBe("#/Intro");
		expect(q("content")?.textContent).toBe("hello");
		expect(text("frame-total")).toBe("/ 59");
	});

	it("shows a still as a still and counts one frame in the singular", async () => {
		await mount(StillAndBlink);
		expect(text("selected-id")).toBe("Card");
		expect(text("composition-meta")).toBe("1200×630 · still");
		await act(async () => {
			(host.querySelector('[data-composition-id="Blink"]') as HTMLButtonElement).click();
		});
		await wait(0);
		expect(text("composition-meta")).toBe("320×180 · 30 fps · 1 frame (0.03 s)");
	});

	it("selects from the hash and runs calculateMetadata, which the Player does not", async () => {
		window.history.replaceState(null, "", "/#/Story");
		await mount();
		expect(text("selected-id")).toBe("Story");
		expect(calculateMetadata).toHaveBeenCalledWith(
			expect.objectContaining({
				props: { seconds: 2 },
				isRendering: false,
				compositionId: "Story",
			}),
		);
		expect(text("composition-meta")).toBe("1080×1920 · 30 fps · 60 frames (2.00 s)");

		await typeProps('{"seconds": 3}');
		await wait(300);
		expect(text("composition-meta")).toBe("1080×1920 · 30 fps · 90 frames (3.00 s)");
		expect(text("frame-total")).toBe("/ 89");
	});

	it("switches composition on click and keeps the selection in the hash", async () => {
		await mount();
		const story = host.querySelector('[data-composition-id="Story"]') as HTMLButtonElement;
		await act(async () => story.click());
		await wait(0);
		expect(window.location.hash).toBe("#/Story");
		expect(text("selected-id")).toBe("Story");
		expect(story.getAttribute("aria-current")).toBe("true");
	});

	it("shows invalid JSON and schema issues, keeping the last valid props on screen", async () => {
		await mount();
		await typeProps('{"title": 1}');
		expect(text("props-issues")).toBe("title: Expected string");
		await wait(300);
		expect(q("content")?.textContent).toBe("1");
		await typeProps("{nope");
		expect(text("props-error")).toMatch(/^Invalid JSON/);
		expect((q("props-editor") as HTMLTextAreaElement).getAttribute("aria-invalid")).toBe("true");
		await wait(300);
		// The previous valid props ({"title": 1}) still render.
		expect(q("content")?.textContent).toBe("1");
		await typeProps('{"title": "edited"}');
		await wait(300);
		expect(q("content")?.textContent).toBe("edited");
		// The edit survives a reload of the page.
		act(() => root.unmount());
		host.remove();
		await mount();
		expect((q("props-editor") as HTMLTextAreaElement).value).toBe('{"title": "edited"}');
	});

	it("merges --props over the default props in the editor", async () => {
		await mount(Compositions, { ...OPTIONS, initialProps: { title: "from cli" } });
		expect(JSON.parse((q("props-editor") as HTMLTextAreaElement).value)).toEqual({
			title: "from cli",
		});
	});

	it("steps frames and sets the loop range from the keyboard", async () => {
		await mount();
		const press = (key: string, init: KeyboardEventInit = {}) =>
			act(async () => {
				window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
			});
		await press("ArrowRight");
		await press("ArrowRight");
		expect((q("frame-input") as HTMLInputElement).value).toBe("2");
		expect(q("content")?.getAttribute("data-frame")).toBe("2");
		await press("i");
		await press("ArrowRight", { shiftKey: true });
		expect((q("frame-input") as HTMLInputElement).value).toBe("32");
		await press("o");
		expect(text("in-frame")).toBe("2");
		expect(text("out-frame")).toBe("32");
		await press("End");
		expect((q("frame-input") as HTMLInputElement).value).toBe("59");
		await press("x");
		expect(text("in-frame")).toBe("0");
		expect(text("out-frame")).toBe("59");
	});

	it("ignores shortcuts typed into the props editor and when disabled", async () => {
		await mount(Compositions, { ...OPTIONS, keyboardShortcuts: false });
		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
		});
		expect((q("frame-input") as HTMLInputElement).value).toBe("0");
		expect(host.textContent).toContain("Keyboard shortcuts are disabled.");
	});

	it("shows the error of a root that throws", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		await mount(BrokenRoot);
		expect(host.textContent).toContain("The root component threw");
		expect(host.textContent).toContain("root exploded");
		spy.mockRestore();
	});

	it("warns about props keys that are not in defaultProps", async () => {
		await mount();
		await typeProps('{"titel": "Typo"}');
		// The test schema has no readable shape: only defaultProps are compared.
		expect(text("props-issues")).toContain(
			'titel: Unknown prop: not in defaultProps. Did you mean "title"?',
		);
	});

	it("shows the sequences in the timeline by name, nested, and seeks from it", async () => {
		await mount(Lab);
		const labels = () => [...host.querySelectorAll(".mp-tl-label")].map((el) => el.textContent);
		// "Shine" is inside "Title" (frames 10 to 29): it registers once Title renders.
		expect(labels()).toEqual(["Series", "One", "Series.Sequence", "Title"]);
		const title = host.querySelector('.mp-tl-bar[aria-label^="Title,"]') as HTMLButtonElement;
		expect(title.getAttribute("aria-label")).toBe("Title, frames 10 to 29. Go to its first frame.");
		expect(Number.parseFloat(title.style.left)).toBeCloseTo((10 / 60) * 100, 3);
		await act(async () => title.click());
		expect((q("frame-input") as HTMLInputElement).value).toBe("10");
		expect(labels()).toEqual(["Series", "One", "Series.Sequence", "Title", "Shine"]);
		const ruler = q("timeline-ruler") as HTMLElement;
		expect(ruler.getAttribute("aria-valuetext")).toBe("Frame 10, 00:00:00:10");
		await act(async () => {
			ruler.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "ArrowRight",
					shiftKey: true,
					bubbles: true,
					cancelable: true,
				}),
			);
		});
		// One handler only: the page's global shortcut does not step a second time.
		expect((q("frame-input") as HTMLInputElement).value).toBe("40");
		await act(async () => {
			ruler.dispatchEvent(
				new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }),
			);
		});
		expect(ruler.getAttribute("aria-valuenow")).toBe("59");
		// Out of Title's range, Shine is unmounted but keeps its row.
		expect(labels()).toEqual(["Series", "One", "Series.Sequence", "Title", "Shine"]);
	});

	it("lists an open delayRender() in the Problems panel", async () => {
		window.history.replaceState(null, "", "#/Waiting");
		await mount(Lab);
		await wait(600);
		expect(text("problems")).toContain('delayRender("Waiting for the API") open for');
		expect(text("problems-button")).toBe("1 problem");
	});

	it("shows where a composition threw, with the frame", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		window.history.replaceState(null, "", "#/Throws");
		await mount(Lab);
		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
		});
		await wait(50);
		expect(text("player-error")).toContain("Boom at frame three");
		expect(text("player-error")).toContain("Thrown while rendering frame 3 of Throws.");
		spy.mockRestore();
	});

	it("explains an empty root", async () => {
		await mount(() => null);
		expect(host.textContent).toContain("No compositions");
	});
});
