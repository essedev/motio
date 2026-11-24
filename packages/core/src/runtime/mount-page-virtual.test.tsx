import { useEffect, useState } from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installClockShim } from "../clock-shim.js";
import { Composition } from "../composition/composition.js";
import { registerRoot, resetRoot } from "../composition/register-root.js";
import { pageWarnings } from "../page-warnings.js";
import { RUN_CONTEXT_GLOBAL } from "../protocol.js";
import { readiness } from "../readiness/registry.js";
import { useCurrentFrame } from "../timeline/hooks.js";
import { mountPage } from "./mount-page.js";

// The page runtime in the virtual time model (ARCHITECTURE, "Time"): the shim is installed on the
// test window, as the renderer installs it before any page script.
const g = globalThis as Record<string, unknown>;
let container: HTMLElement;

beforeAll(() => {
	g[RUN_CONTEXT_GLOBAL] = {
		protocol: 2,
		inputProps: {},
		env: {},
		timeModel: "virtual",
		readinessTimeoutMs: 2000,
		isRendering: true,
	};
	installClockShim(window as Window & typeof globalThis);
});
afterAll(() => {
	delete g[RUN_CONTEXT_GLOBAL];
});
beforeEach(() => {
	resetRoot();
	readiness.reset();
	pageWarnings.reset();
	container?.remove();
	container = document.createElement("div");
	document.body.appendChild(container);
});

const text = () => container.querySelector("#motio-canvas")?.textContent ?? "";

/** Counts interval ticks and animation frames; shows them with the frame and the clock. */
const Counter = () => {
	const frame = useCurrentFrame();
	const [ticks, setTicks] = useState(0);
	const [rafs, setRafs] = useState(0);
	useEffect(() => {
		const id = setInterval(() => setTicks((t) => t + 1), 100);
		let raf = 0;
		const loop = () => {
			setRafs((r) => r + 1);
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => {
			clearInterval(id);
			cancelAnimationFrame(raf);
		};
	}, []);
	return <div>{`f${frame} t${ticks} r${rafs} now${performance.now()}`}</div>;
};

function root() {
	registerRoot(() => (
		<Composition
			id="c"
			component={Counter}
			width={100}
			height={100}
			fps={10}
			durationInFrames={30}
		/>
	));
}

describe("mountPage in the virtual time model", () => {
	it("lists the virtual model and steps through every frame before the one asked", async () => {
		root();
		const api = mountPage({ container, installGlobal: false });
		expect(api.timeModels).toContain("virtual");
		await api.setComposition("c", {});
		const report = await api.seek(12);
		expect(report.frame).toBe(12);
		// One animation frame per frame 0 to 12, an interval tick every 100 ms (one frame at 10 fps).
		expect(text()).toBe("f12 t12 r13 now1200");
	});

	it("gives the same frame after a warm-up in several calls as after one seek", async () => {
		root();
		const api = mountPage({ container, installGlobal: false });
		await api.setComposition("c", {});
		await api.advance?.(4);
		await api.advance?.(9);
		await api.seek(12);
		expect(text()).toBe("f12 t12 r13 now1200");
		await api.seek(13);
		expect(text()).toBe("f13 t13 r14 now1300");
	});

	it("rejects a frame at or before the last one, and advance() out of order", async () => {
		root();
		const api = mountPage({ container, installGlobal: false });
		await api.setComposition("c", {});
		await api.seek(5);
		await expect(api.seek(5)).rejects.toMatchObject({
			code: "E_RENDER_ERROR",
			message: expect.stringMatching(/ascending order/),
		});
		await expect(api.seek(2)).rejects.toMatchObject({ code: "E_RENDER_ERROR" });
		await expect(api.advance?.(5)).rejects.toMatchObject({ code: "E_RENDER_ERROR" });
		await expect(api.setComposition("c", {})).rejects.toMatchObject({
			code: "E_INVALID_COMPOSITION",
		});
	});
});
