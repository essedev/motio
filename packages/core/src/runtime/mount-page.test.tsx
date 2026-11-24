import { lazy, useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AssetError } from "../asset-error.js";
import { Composition, Still } from "../composition/composition.js";
import { Folder } from "../composition/folder.js";
import { registerRoot, resetRoot } from "../composition/register-root.js";
import { audioIntents } from "../media/audio-intents.js";
import { pageWarnings } from "../page-warnings.js";
import { RUN_CONTEXT_GLOBAL } from "../protocol.js";
import { cancelRender, continueRender, delayRender } from "../readiness/delay-render.js";
import { readiness } from "../readiness/registry.js";
import { useCurrentFrame, useVideoConfig } from "../timeline/hooks.js";
import { Sequence } from "../timeline/sequence.js";
import { mountPage } from "./mount-page.js";

const g = globalThis as Record<string, unknown>;
let container: HTMLElement;

beforeEach(() => {
	resetRoot();
	readiness.reset();
	pageWarnings.reset();
	container = document.createElement("div");
	document.body.appendChild(container);
	g[RUN_CONTEXT_GLOBAL] = {
		protocol: 1,
		inputProps: {},
		env: {},
		timeModel: "frame",
		readinessTimeoutMs: 2000,
		isRendering: true,
	};
});

afterEach(() => {
	container.remove();
	delete g[RUN_CONTEXT_GLOBAL];
});

const canvasText = () => container.querySelector("#motio-canvas")?.textContent ?? "";

const FrameText = () => {
	const frame = useCurrentFrame();
	const { id, width, height } = useVideoConfig();
	return <div>{`${id} ${width}x${height} ${frame}`}</div>;
};

describe("mountPage", () => {
	it("collects compositions, resolves metadata and renders frames", async () => {
		registerRoot(() => (
			<>
				<Folder name="core">
					<Composition
						id="a"
						component={FrameText}
						width={640}
						height={360}
						fps={30}
						durationInFrames={60}
					/>
				</Folder>
				<Composition
					id="meta"
					component={FrameText}
					width={100}
					height={100}
					fps={30}
					durationInFrames={10}
					defaultProps={{ title: "x" }}
					calculateMetadata={async ({ props }) => ({ width: 480, props: { ...props, more: 1 } })}
				/>
				<Still id="poster" component={FrameText} width={320} height={180} />
			</>
		));
		const api = mountPage({ container, installGlobal: false });
		const comps = await api.getCompositions();
		expect(
			comps.map((c) => [c.id, c.fps, c.durationInFrames, c.isStill, c.hasCalculateMetadata]),
		).toEqual([
			["a", 30, 60, false, false],
			["meta", 30, 10, false, true],
			["poster", 1, 1, true, false],
		]);
		const meta = await api.setComposition("meta", { input: true });
		expect(meta).toMatchObject({
			width: 480,
			height: 100,
			props: { title: "x", input: true, more: 1 },
		});

		await api.setComposition("a", {});
		const report = await api.seek(12);
		expect(report.frame).toBe(12);
		expect(document.documentElement.getAttribute("data-motio-frame")).toBe("12");
		expect(canvasText()).toBe("a 640x360 12");
		const canvas = container.querySelector<HTMLElement>("#motio-canvas");
		expect([canvas?.style.width, canvas?.style.height]).toEqual(["640px", "360px"]);
		await api.seek(3);
		expect(canvasText()).toBe("a 640x360 3");
	});

	it("uses already resolved metadata without running calculateMetadata again", async () => {
		let calls = 0;
		registerRoot(() => (
			<Composition
				id="meta"
				component={FrameText}
				width={100}
				height={100}
				fps={30}
				durationInFrames={10}
				defaultProps={{ title: "x" }}
				calculateMetadata={({ props }) => {
					calls++;
					return { props: { ...props, title: `${String(props.title)} resolved` } };
				}}
			/>
		));
		const api = mountPage({ container, installGlobal: false });
		const first = await api.setComposition("meta", {});
		expect(first.props).toEqual({ title: "x resolved" });
		const again = await api.setComposition("meta", first.props, { resolved: first });
		expect(calls).toBe(1);
		expect(again.props).toEqual({ title: "x resolved" });
		await expect(
			api.setComposition("meta", {}, { resolved: { ...first, width: 0 } }),
		).rejects.toMatchObject({ code: "E_INVALID_COMPOSITION" });
	});

	it("waits for registerRoot() called later", async () => {
		const api = mountPage({ container, installGlobal: false });
		const pending = api.getCompositions();
		setTimeout(() =>
			registerRoot(() => (
				<Composition
					id="late"
					component={FrameText}
					width={10}
					height={10}
					fps={1}
					durationInFrames={1}
				/>
			)),
		);
		expect((await pending).map((c) => c.id)).toEqual(["late"]);
	});

	it("rejects unknown compositions, invalid compositions and out-of-range frames", async () => {
		registerRoot(() => (
			<Composition
				id="a"
				component={FrameText}
				width={10}
				height={10}
				fps={30}
				durationInFrames={5}
			/>
		));
		const api = mountPage({ container, installGlobal: false });
		await expect(api.setComposition("nope", {})).rejects.toMatchObject({
			code: "E_COMPOSITION_NOT_FOUND",
		});
		await api.setComposition("a", {});
		await expect(api.seek(5)).rejects.toMatchObject({ code: "E_RENDER_ERROR" });

		resetRoot();
		const other = document.createElement("div");
		document.body.appendChild(other);
		registerRoot(() => (
			<Composition
				id="bad id"
				component={FrameText}
				width={10}
				height={10}
				fps={30}
				durationInFrames={5}
			/>
		));
		const api2 = mountPage({ container: other, installGlobal: false });
		await expect(api2.getCompositions()).rejects.toMatchObject({
			code: "E_INVALID_COMPOSITION",
			message: expect.stringMatching(/id "bad id" is invalid/),
		});
		other.remove();
	});

	it("reports calculateMetadata errors with their code", async () => {
		registerRoot(() => (
			<Composition
				id="a"
				component={FrameText}
				width={10}
				height={10}
				fps={30}
				durationInFrames={5}
				calculateMetadata={() => {
					throw new Error("API down");
				}}
			/>
		));
		const api = mountPage({ container, installGlobal: false });
		await expect(api.setComposition("a", {})).rejects.toMatchObject({
			code: "E_CALCULATE_METADATA",
			message: expect.stringMatching(/API down/),
		});
	});

	it("times out a readiness handle with its label, frame and retries", async () => {
		const Stuck = () => {
			useState(() => delayRender("never released", { timeoutInMilliseconds: 50, retries: 1 }));
			return null;
		};
		registerRoot(() => (
			<Composition id="a" component={Stuck} width={10} height={10} fps={30} durationInFrames={5} />
		));
		const api = mountPage({ container, installGlobal: false });
		await api.setComposition("a", {});
		await expect(api.seek(2)).rejects.toMatchObject({
			code: "E_READINESS_TIMEOUT",
			label: "never released",
			frame: 2,
			retries: 1,
		});
	});

	it("names the timeout for the Node API and the CLI, and reports its length", async () => {
		const Stuck = () => {
			useState(() => delayRender("Waiting for the API", { timeoutInMilliseconds: 50 }));
			return null;
		};
		registerRoot(() => (
			<Composition id="a" component={Stuck} width={10} height={10} fps={30} durationInFrames={5} />
		));
		const api = mountPage({ container, installGlobal: false });
		await api.setComposition("a", {});
		await expect(api.seek(0)).rejects.toMatchObject({
			code: "E_READINESS_TIMEOUT",
			timeoutMs: 50,
			message:
				'A delayRender() "Waiting for the API" was called but not cleared within 50 ms while rendering frame 0. Call continueRender() with its handle once the work is done, or raise the timeout (timeoutInMilliseconds in the Node API, --timeout on the command line).',
		});
	});

	it("lists the open readiness handles while a frame waits on them", async () => {
		let release = () => {};
		const Waits = () => {
			useState(() => {
				const handle = delayRender("Fetching data", { timeoutInMilliseconds: 1500 });
				release = () => continueRender(handle);
				return handle;
			});
			return null;
		};
		registerRoot(() => (
			<Composition id="a" component={Waits} width={10} height={10} fps={30} durationInFrames={5} />
		));
		const api = mountPage({ container, installGlobal: false });
		await api.setComposition("a", {});
		const seeking = api.seek(0);
		await new Promise((r) => setTimeout(r, 30));
		// Answered while the seek is still waiting, not queued behind it.
		const pending = api.pending?.() ?? [];
		expect(pending).toEqual([
			{ label: "Fetching data", elapsedMs: expect.any(Number), timeoutMs: 1500 },
		]);
		expect(pending[0]?.elapsedMs).toBeGreaterThanOrEqual(20);
		release();
		await expect(seeking).resolves.toMatchObject({ frame: 0 });
		expect(api.pending?.()).toEqual([]);
	});

	it("warns once when a frame calls Math.random()", async () => {
		const Random = () => {
			const frame = useCurrentFrame();
			return <div style={{ left: Math.random() * 100 }}>{frame}</div>;
		};
		registerRoot(() => (
			<Composition id="a" component={Random} width={10} height={10} fps={30} durationInFrames={5} />
		));
		const api = mountPage({ container, installGlobal: false });
		await api.setComposition("a", {});
		const first = await api.seek(0);
		expect(first.warnings.filter((w) => w.code === "W_MATH_RANDOM")).toEqual([
			{
				code: "W_MATH_RANDOM",
				message: expect.stringMatching(
					/^Math\.random\(\) was called \d+ times? while frame 0 rendered\. .*Use random\(seed\)/,
				),
			},
		]);
		const second = await api.seek(1);
		expect(second.warnings.filter((w) => w.code === "W_MATH_RANDOM")).toEqual([]);
	});

	it("passes warnings reported by components into the frame report", async () => {
		const Reports = () => {
			pageWarnings.report({ code: "W_TIMELINE_SHORT", message: "short" });
			return null;
		};
		registerRoot(() => (
			<Composition
				id="a"
				component={Reports}
				width={10}
				height={10}
				fps={30}
				durationInFrames={5}
			/>
		));
		const api = mountPage({ container, installGlobal: false });
		await api.setComposition("a", {});
		expect((await api.seek(0)).warnings).toContainEqual({
			code: "W_TIMELINE_SHORT",
			message: "short",
		});
		expect((await api.seek(1)).warnings).not.toContainEqual({
			code: "W_TIMELINE_SHORT",
			message: "short",
		});
	});

	it("lists compositions when a module-level font fails, then fails the frame with its code", async () => {
		// What loadFont() does at module level: a handle, then cancelRender() with an AssetError.
		const handle = delayRender("Loading font");
		setTimeout(() => {
			continueRender(handle);
			try {
				cancelRender(
					new AssetError("E_FONT_LOAD", "loadFont() could not fetch public/missing.woff2", {
						path: "missing.woff2",
					}),
				);
			} catch {
				// cancelRender() throws by contract.
			}
		}, 10);
		registerRoot(() => (
			<Composition
				id="a"
				component={FrameText}
				width={10}
				height={10}
				fps={30}
				durationInFrames={5}
			/>
		));
		const api = mountPage({ container, installGlobal: false });
		expect((await api.getCompositions()).map((c) => c.id)).toEqual(["a"]);
		await api.setComposition("a", {});
		await expect(api.seek(0)).rejects.toMatchObject({
			code: "E_FONT_LOAD",
			details: { path: "missing.woff2" },
		});
		expect(api.cancelled?.()).toMatchObject({ code: "E_FONT_LOAD" });
	});

	it("fails with E_CANCELLED when cancelRender() is called", async () => {
		const Cancels = () => {
			useEffect(() => {
				setTimeout(() => {
					try {
						cancelRender(new Error("bad input"));
					} catch {
						// cancelRender() throws by contract; the test only checks the page error.
					}
				}, 5);
			}, []);
			useState(() => delayRender("waiting"));
			return null;
		};
		registerRoot(() => (
			<Composition
				id="a"
				component={Cancels}
				width={10}
				height={10}
				fps={30}
				durationInFrames={5}
			/>
		));
		const api = mountPage({ container, installGlobal: false });
		await api.setComposition("a", {});
		await expect(api.seek(0)).rejects.toMatchObject({ code: "E_CANCELLED", message: "bad input" });
	});

	it("reports render errors and recovers on the next seek", async () => {
		const Throws = () => {
			const frame = useCurrentFrame();
			if (frame === 1) throw new Error("frame one is broken");
			return <div>{`ok ${frame}`}</div>;
		};
		registerRoot(() => (
			<Composition id="a" component={Throws} width={10} height={10} fps={30} durationInFrames={5} />
		));
		const api = mountPage({ container, installGlobal: false });
		await api.setComposition("a", {});
		await expect(api.seek(1)).rejects.toMatchObject({
			code: "E_RENDER_ERROR",
			message: "frame one is broken",
			frame: 1,
		});
		await api.seek(2);
		expect(canvasText()).toBe("ok 2");
	});

	it("writes the absolute start of sequences for animation seeking", async () => {
		registerRoot(() => (
			<Composition
				id="a"
				component={() => (
					<Sequence from={10}>
						<FrameText />
					</Sequence>
				)}
				width={10}
				height={10}
				fps={30}
				durationInFrames={30}
			/>
		));
		const api = mountPage({ container, installGlobal: false });
		await api.setComposition("a", {});
		await api.seek(15);
		expect(container.querySelector("[data-motio-from]")?.getAttribute("data-motio-from")).toBe(
			"10",
		);
	});
});

describe("audio intents", () => {
	const Sound = ({ from }: { from: number }) => {
		const frame = useCurrentFrame();
		const owner = useRef({});
		useLayoutEffect(() => {
			const token = owner.current;
			audioIntents.set(token, {
				src: "http://x/a.wav",
				sourceFrame: frame - from,
				playbackRate: 1,
				toneFrequency: 1,
				preservePitch: true,
				volume: 1,
				audioStreamIndex: null,
			});
			return () => audioIntents.delete(token);
		}, [frame, from]);
		return null;
	};

	it("returns the intents of the mounted components in the frame report", async () => {
		registerRoot(() => (
			<Composition
				id="a"
				component={() => (
					<Sequence from={10}>
						<Sound from={0} />
					</Sequence>
				)}
				width={10}
				height={10}
				fps={30}
				durationInFrames={30}
			/>
		));
		const api = mountPage({ container, installGlobal: false });
		await api.setComposition("a", {});
		expect((await api.seek(5)).audio).toEqual([]);
		expect((await api.seek(12)).audio).toEqual([
			{
				id: "0",
				src: "http://x/a.wav",
				sourceFrame: 2,
				playbackRate: 1,
				toneFrequency: 1,
				preservePitch: true,
				volume: 1,
				audioStreamIndex: null,
			},
		]);
		expect((await api.seek(3)).audio).toEqual([]);
	});
});

describe("React fixtures: identical frames in any order", () => {
	const DelayInEffect = () => {
		const frame = useCurrentFrame();
		const [handle] = useState(() => delayRender("async data"));
		const [value, setValue] = useState<string | null>(null);
		useEffect(() => {
			const t = setTimeout(() => {
				setValue("loaded");
				continueRender(handle);
			}, 10);
			return () => clearTimeout(t);
		}, [handle]);
		return <div>{`delay ${value} ${frame}`}</div>;
	};
	const StateInEffect = () => {
		const frame = useCurrentFrame();
		const [doubled, setDoubled] = useState(-1);
		useEffect(() => setDoubled(frame * 2), [frame]);
		return <div>{`effect ${doubled}`}</div>;
	};
	const Deferred = () => {
		const frame = useCurrentFrame();
		const deferred = useDeferredValue(frame);
		return <div>{`deferred ${deferred}`}</div>;
	};
	const LazyChild = lazy(
		() =>
			new Promise<{ default: React.FC<{ frame: number }> }>((resolve) =>
				setTimeout(() => resolve({ default: ({ frame }) => <div>{`lazy ${frame}`}</div> }), 20),
			),
	);
	const WithLazy = () => <LazyChild frame={useCurrentFrame()} />;

	const fixtures: Array<[string, React.FC, (f: number) => string]> = [
		["delay-in-effect", DelayInEffect, (f) => `delay loaded ${f}`],
		["state-in-effect", StateInEffect, (f) => `effect ${f * 2}`],
		["deferred-value", Deferred, (f) => `deferred ${f}`],
		["lazy-suspense", WithLazy, (f) => `lazy ${f}`],
	];

	for (const [id, component, expected] of fixtures) {
		it(`${id}: settles before reporting the frame`, async () => {
			registerRoot(() => (
				<Composition
					id={id}
					component={component}
					width={10}
					height={10}
					fps={30}
					durationInFrames={40}
				/>
			));
			const api = mountPage({ container, installGlobal: false });
			await api.setComposition(id, {});
			const order = [17, 3, 39, 0, 25, 3, 12, 38, 1, 17];
			for (const f of order) {
				await api.seek(f);
				expect(canvasText()).toBe(expected(f));
			}
		});
	}
});
