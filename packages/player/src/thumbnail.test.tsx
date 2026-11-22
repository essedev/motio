// @vitest-environment jsdom
import { getRemotionEnvironment, useBufferState, useCurrentFrame } from "@motiojs/core";
import { createRef, useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Catch, type Mounted, mount } from "./test-support/dom.js";
import { Thumbnail } from "./thumbnail.js";
import type { ThumbnailRef } from "./types.js";

function Frame() {
	const frame = useCurrentFrame();
	return (
		<div data-testid="frame" data-player={String(getRemotionEnvironment().isPlayer)}>
			{frame}
		</div>
	);
}

function Buffering({ block }: { block: boolean }) {
	const buffer = useBufferState();
	useEffect(() => {
		if (!block) return;
		const h = buffer.delayPlayback();
		return () => h.unblock();
	}, [block, buffer]);
	return null;
}

const Broken = (): never => {
	throw new Error("thumb failed");
};

const base = {
	component: Frame,
	durationInFrames: 60,
	fps: 30,
	compositionWidth: 1280,
	compositionHeight: 720,
};

let mounted: Mounted | null = null;

afterEach(() => {
	mounted?.unmount();
	mounted = null;
	vi.restoreAllMocks();
});

describe("Thumbnail", () => {
	it("renders frameToDisplay at the fitted scale", () => {
		const ref = createRef<ThumbnailRef>();
		mounted = mount(<Thumbnail ref={ref} {...base} frameToDisplay={17} style={{ width: 320 }} />);
		const el = document.querySelector<HTMLElement>("[data-testid=frame]");
		expect(el?.textContent).toBe("17");
		expect(el?.dataset.player).toBe("true");
		expect(ref.current?.getScale()).toBe(0.25);
		expect(ref.current?.getContainerNode()?.className).toBe("__remotion-player");
	});

	it("validates frameToDisplay", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		let caught: unknown = null;
		mounted = mount(
			<Catch onError={(e) => (caught = e)}>
				<Thumbnail {...base} frameToDisplay={60} />
			</Catch>,
		);
		expect(String(caught)).toMatch(/frameToDisplay/);
	});

	it("dispatches waiting and resume for buffer handles", () => {
		const ref = createRef<ThumbnailRef>();
		const props = { ...base, component: Buffering, frameToDisplay: 0 };
		mounted = mount(<Thumbnail ref={ref} {...props} inputProps={{ block: false }} />);
		const names: string[] = [];
		ref.current?.addEventListener("waiting", () => names.push("waiting"));
		ref.current?.addEventListener("resume", () => names.push("resume"));
		mounted.rerender(<Thumbnail ref={ref} {...props} inputProps={{ block: true }} />);
		mounted.rerender(<Thumbnail ref={ref} {...props} inputProps={{ block: false }} />);
		expect(names).toEqual(["waiting", "resume"]);
	});

	it("dispatches error and shows the default error UI", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const ref = createRef<ThumbnailRef>();
		const errors: string[] = [];
		mounted = mount(<Thumbnail ref={ref} {...base} frameToDisplay={0} component={Frame} />);
		ref.current?.addEventListener("error", (e) => errors.push(e.detail.error.message));
		mounted.rerender(<Thumbnail ref={ref} {...base} frameToDisplay={0} component={Broken} />);
		expect(errors).toEqual(["thumb failed"]);
		expect(document.body.textContent).toContain("Error: thumb failed");
	});
});
