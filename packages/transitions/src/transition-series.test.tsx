// @vitest-environment jsdom
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "@motiojs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clockWipe } from "./presentations/clock-wipe.js";
import { fade } from "./presentations/fade.js";
import { flip } from "./presentations/flip.js";
import { iris } from "./presentations/iris.js";
import { none } from "./presentations/none.js";
import { slide } from "./presentations/slide.js";
import { wipe } from "./presentations/wipe.js";
import { type Mounted, renderAtFrame, texts } from "./testing/harness.js";
import { linearTiming } from "./timings/linear-timing.js";
import { springTiming } from "./timings/spring-timing.js";
import { useTransitionProgress } from "./transition-progress.js";
import { TransitionSeries } from "./transition-series.js";
import type { TransitionPresentationComponentProps } from "./types.js";

const Panel = ({ label }: { label: string }) => {
	const frame = useCurrentFrame();
	return <div data-label={label}>{`${label} ${frame}`}</div>;
};

// The Transitions composition of fixtures/features/src/Root.tsx.
const Transitions = () => {
	const { width, height } = useVideoConfig();
	return (
		<TransitionSeries>
			<TransitionSeries.Sequence durationInFrames={30}>
				<Panel label="A" />
			</TransitionSeries.Sequence>
			<TransitionSeries.Transition
				presentation={fade()}
				timing={linearTiming({ durationInFrames: 10 })}
			/>
			<TransitionSeries.Sequence durationInFrames={30}>
				<Panel label="B" />
			</TransitionSeries.Sequence>
			<TransitionSeries.Transition
				presentation={slide({ direction: "from-right" })}
				timing={springTiming({ config: { damping: 200 }, durationInFrames: 12 })}
			/>
			<TransitionSeries.Sequence durationInFrames={30}>
				<Panel label="C" />
			</TransitionSeries.Sequence>
			<TransitionSeries.Transition
				presentation={wipe({ direction: "from-top-left" })}
				timing={linearTiming({ durationInFrames: 10 })}
			/>
			<TransitionSeries.Sequence durationInFrames={30}>
				<Panel label="D" />
			</TransitionSeries.Sequence>
			<TransitionSeries.Transition
				presentation={flip({ direction: "from-left" })}
				timing={linearTiming({ durationInFrames: 10 })}
			/>
			<TransitionSeries.Sequence durationInFrames={30}>
				<Panel label="E" />
			</TransitionSeries.Sequence>
			<TransitionSeries.Transition
				presentation={clockWipe({ width, height })}
				timing={linearTiming({ durationInFrames: 10 })}
			/>
			<TransitionSeries.Sequence durationInFrames={30}>
				<Panel label="F" />
			</TransitionSeries.Sequence>
			<TransitionSeries.Transition
				presentation={iris({ width, height })}
				timing={linearTiming({ durationInFrames: 10 })}
			/>
			<TransitionSeries.Sequence durationInFrames={30}>
				<Panel label="G" />
			</TransitionSeries.Sequence>
		</TransitionSeries>
	);
};

const calls: Array<[string, number, number, unknown]> = [];
const Recorder = ({
	children,
	presentationDirection,
	presentationProgress,
	presentationDurationInFrames,
	passedProps,
}: TransitionPresentationComponentProps<{ tag: string }>) => {
	calls.push([
		presentationDirection,
		presentationProgress,
		presentationDurationInFrames,
		passedProps.tag,
	]);
	return <AbsoluteFill>{children}</AbsoluteFill>;
};

const Probe = ({ label }: { label: string }) => {
	const { entering, exiting, isInTransitionSeries } = useTransitionProgress();
	return <div data-label={label}>{`${label} ${entering} ${exiting} ${isInTransitionSeries}`}</div>;
};

let mounted: Mounted | null = null;
afterEach(() => {
	mounted?.unmount();
	mounted = null;
	vi.restoreAllMocks();
});

/** Inline style of the closest ancestor of `label` that sets `property`. */
function styleAbove(container: Element, label: string, property: string): string {
	let el: HTMLElement | null = container.querySelector<HTMLElement>(`[data-label="${label}"]`);
	while (el && el !== container) {
		const value = el.style.getPropertyValue(property);
		if (value) return value;
		el = el.parentElement;
	}
	return "";
}

describe("<TransitionSeries> on the features fixture", () => {
	// Scenes and local frames read off fixtures/features/__golden__/remotion/transitions/*.png,
	// in stacking order (the entering scene is drawn over the exiting one).
	const expected: Record<number, string[]> = {
		0: ["A 0"],
		25: ["A 25", "B 5"],
		30: ["B 10"],
		35: ["B 15"],
		50: ["C 12"],
		55: ["C 17"],
		60: ["C 22", "D 2"],
		75: ["D 17"],
		80: ["D 22", "E 2"],
		85: ["D 27", "E 7"],
		100: ["E 22", "F 2"],
		105: ["E 27", "F 7"],
		110: ["F 12"],
		125: ["F 27", "G 7"],
		130: ["G 12"],
		135: ["G 17"],
		147: ["G 29"],
	};

	it("mounts the scenes of the reference stills at their local frames", () => {
		mounted = renderAtFrame(<Transitions />, 0);
		for (const [frame, labels] of Object.entries(expected)) {
			mounted.at(Number(frame));
			expect(texts(mounted.container), `frame ${frame}`).toEqual(labels);
		}
	});

	it("overlaps two scenes during each transition and one otherwise", () => {
		mounted = renderAtFrame(<Transitions />, 0);
		const overlapping: number[] = [];
		for (let frame = 0; frame < 148; frame++) {
			mounted.at(frame);
			if (texts(mounted.container).length === 2) overlapping.push(frame);
		}
		const windows = [
			[20, 30],
			[38, 50],
			[58, 68],
			[78, 88],
			[98, 108],
			[118, 128],
		];
		expect(overlapping).toEqual(
			windows.flatMap(([a = 0, b = 0]) => Array.from({ length: b - a }, (_, i) => a + i)),
		);
	});

	it("applies each presentation at the progress of the stills", () => {
		mounted = renderAtFrame(<Transitions />, 25);
		// fade at 0.5: the entering scene is half transparent over the opaque exiting scene.
		expect(styleAbove(mounted.container, "B", "opacity")).toBe("0.5");
		expect(styleAbove(mounted.container, "A", "opacity")).toBe("1");
		mounted.at(60);
		expect(styleAbove(mounted.container, "D", "clip-path")).toBe("polygon(0% 0%, 40% 0%, 0% 40%)");
		expect(styleAbove(mounted.container, "C", "clip-path")).toBe("");
		mounted.at(80);
		expect(styleAbove(mounted.container, "D", "transform")).toBe("rotateY(36deg)");
		expect(styleAbove(mounted.container, "E", "transform")).toBe("rotateY(-144deg)");
		expect(styleAbove(mounted.container, "D", "perspective")).toBe("1000px");
		mounted.at(125);
		expect(styleAbove(mounted.container, "G", "clip-path")).toMatch(
			/^circle\(25[67]\.\d+px at 50% 50%\)$/,
		);
		mounted.at(44);
		expect(styleAbove(mounted.container, "C", "transform")).toMatch(/^translateX\(\d/);
		expect(styleAbove(mounted.container, "B", "transform")).toMatch(/^translateX\(-\d/);
	});

	it("keeps the entering presentation for one frame after the exiting scene unmounts", () => {
		// Frame 50 of the stills: C is still 2.6 px short of its place (spring progress 0.996).
		mounted = renderAtFrame(<Transitions />, 50);
		expect(texts(mounted.container)).toEqual(["C 12"]);
		const offset = Number(
			/translateX\(([\d.]+)%\)/.exec(styleAbove(mounted.container, "C", "transform"))?.[1],
		);
		expect((offset / 100) * 640).toBeCloseTo(2.6, 1);
		mounted.at(51);
		expect(styleAbove(mounted.container, "C", "transform")).toBe("");
		mounted.at(30);
		expect(styleAbove(mounted.container, "B", "opacity")).toBe("1");
		mounted.at(31);
		expect(styleAbove(mounted.container, "B", "opacity")).toBe("");
	});
});

describe("presentation components", () => {
	it("receive direction, progress, duration and passed props", () => {
		calls.length = 0;
		mounted = renderAtFrame(
			<TransitionSeries>
				<TransitionSeries.Sequence durationInFrames={40}>
					<Panel label="A" />
				</TransitionSeries.Sequence>
				<TransitionSeries.Transition
					presentation={{ component: Recorder, props: { tag: "x" } }}
					timing={linearTiming({ durationInFrames: 20 })}
				/>
				<TransitionSeries.Sequence durationInFrames={40}>
					<Panel label="B" />
				</TransitionSeries.Sequence>
			</TransitionSeries>,
			25,
		);
		expect(calls).toEqual([
			["exiting", 0.25, 20, "x"],
			["entering", 0.25, 20, "x"],
		]);
	});

	it("default to slide()", () => {
		mounted = renderAtFrame(
			<TransitionSeries>
				<TransitionSeries.Sequence durationInFrames={20}>
					<Panel label="A" />
				</TransitionSeries.Sequence>
				<TransitionSeries.Transition timing={linearTiming({ durationInFrames: 10 })} />
				<TransitionSeries.Sequence durationInFrames={20}>
					<Panel label="B" />
				</TransitionSeries.Sequence>
			</TransitionSeries>,
			15,
		);
		expect(styleAbove(mounted.container, "B", "transform")).toBe("translateX(-50%)");
		expect(styleAbove(mounted.container, "A", "transform")).toBe("translateX(50%)");
	});

	it("animate an entrance and an exit with a transition first and last", () => {
		const tree = (
			<TransitionSeries>
				<TransitionSeries.Transition
					presentation={fade()}
					timing={linearTiming({ durationInFrames: 10 })}
				/>
				<TransitionSeries.Sequence durationInFrames={40}>
					<Panel label="A" />
				</TransitionSeries.Sequence>
				<TransitionSeries.Transition
					presentation={fade({ shouldFadeOutExitingScene: true })}
					timing={linearTiming({ durationInFrames: 20 })}
				/>
			</TransitionSeries>
		);
		mounted = renderAtFrame(tree, 2);
		expect(texts(mounted.container)).toEqual(["A 2"]);
		expect(styleAbove(mounted.container, "A", "opacity")).toBe("0.2");
		mounted.at(15);
		expect(styleAbove(mounted.container, "A", "opacity")).toBe("");
		mounted.at(30);
		expect(styleAbove(mounted.container, "A", "opacity")).toBe("0.5");
		mounted.at(40);
		expect(texts(mounted.container)).toEqual([]);
	});
});

describe("useTransitionProgress()", () => {
	it("reports the entering and exiting progress of the scene", () => {
		mounted = renderAtFrame(
			<>
				<TransitionSeries>
					<TransitionSeries.Sequence durationInFrames={40}>
						<Probe label="A" />
					</TransitionSeries.Sequence>
					<TransitionSeries.Transition
						presentation={none()}
						timing={linearTiming({ durationInFrames: 30 })}
					/>
					<TransitionSeries.Sequence durationInFrames={60}>
						<Probe label="B" />
					</TransitionSeries.Sequence>
				</TransitionSeries>
				<Probe label="C" />
			</>,
			5,
		);
		expect(texts(mounted.container)).toEqual(["A 1 0 true", "C 1 0 false"]);
		mounted.at(25);
		expect(texts(mounted.container)).toEqual(["A 1 0.5 true", "B 0.5 0 true", "C 1 0 false"]);
		mounted.at(40);
		expect(texts(mounted.container)).toEqual(["B 1 0 true", "C 1 0 false"]);
	});
});

describe("<TransitionSeries.Overlay>", () => {
	it("shows its children over the cut, centred, from their frame 0", () => {
		const tree = (
			<TransitionSeries>
				<TransitionSeries.Sequence durationInFrames={60}>
					<Panel label="A" />
				</TransitionSeries.Sequence>
				<TransitionSeries.Overlay durationInFrames={20}>
					<Panel label="flash" />
				</TransitionSeries.Overlay>
				<TransitionSeries.Sequence durationInFrames={60}>
					<Panel label="B" />
				</TransitionSeries.Sequence>
			</TransitionSeries>
		);
		mounted = renderAtFrame(tree, 49);
		expect(texts(mounted.container)).toEqual(["A 49"]);
		mounted.at(50);
		expect(texts(mounted.container)).toEqual(["A 50", "flash 0"]);
		mounted.at(65);
		expect(texts(mounted.container)).toEqual(["B 5", "flash 15"]);
		mounted.at(70);
		expect(texts(mounted.container)).toEqual(["B 10"]);
	});
});

describe("<TransitionSeries> props and errors", () => {
	it("shifts the whole series with from", () => {
		mounted = renderAtFrame(
			<TransitionSeries from={10}>
				<TransitionSeries.Sequence durationInFrames={20}>
					<Panel label="A" />
				</TransitionSeries.Sequence>
			</TransitionSeries>,
			15,
		);
		expect(texts(mounted.container)).toEqual(["A 5"]);
	});

	it("passes sequence props to the scene", () => {
		mounted = renderAtFrame(
			<TransitionSeries>
				<TransitionSeries.Sequence durationInFrames={20} trimBefore={5} className="scene">
					<Panel label="A" />
				</TransitionSeries.Sequence>
			</TransitionSeries>,
			3,
		);
		expect(texts(mounted.container)).toEqual(["A 8"]);
		expect(mounted.container.querySelector(".scene")).not.toBeNull();
	});

	it("warns once for the deprecated layout=none", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		mounted = renderAtFrame(
			<TransitionSeries layout="none">
				<TransitionSeries.Sequence durationInFrames={20}>
					<Panel label="A" />
				</TransitionSeries.Sequence>
			</TransitionSeries>,
			1,
		);
		mounted.at(2);
		expect(texts(mounted.container)).toEqual(["A 2"]);
		expect(warn.mock.calls.filter(([m]) => String(m).includes('layout="none"'))).toHaveLength(1);
	});

	it("throws for children it does not accept and for markers used alone", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect(() =>
			renderAtFrame(
				<TransitionSeries>
					<div />
				</TransitionSeries>,
				0,
			),
		).toThrow(/only accepts <TransitionSeries.Sequence>.*got <div>/);
		expect(() =>
			renderAtFrame(
				<TransitionSeries.Sequence durationInFrames={10}>
					<Panel label="A" />
				</TransitionSeries.Sequence>,
				0,
			),
		).toThrow(/can only be used as a direct child of <TransitionSeries>/);
		expect(() =>
			renderAtFrame(
				<TransitionSeries>
					<TransitionSeries.Sequence durationInFrames={10}>
						<Panel label="A" />
					</TransitionSeries.Sequence>
					<TransitionSeries.Transition timing={undefined as never} />
				</TransitionSeries>,
				0,
			),
		).toThrow(/"timing" prop is required/);
		document.body.innerHTML = "";
	});
});
