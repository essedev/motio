import { lazy, useDeferredValue, useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Composition, Still } from "../composition/composition.js";
import { Folder } from "../composition/folder.js";
import { registerRoot, resetRoot } from "../composition/register-root.js";
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
