import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { type Mounted, renderAtFrame, texts } from "../testing/harness.js";
import { AbsoluteFill } from "./absolute-fill.js";
import { Freeze } from "./freeze.js";
import { useCurrentFrame, useVideoConfig } from "./hooks.js";
import { Loop } from "./loop.js";
import { cropClipPath, Sequence } from "./sequence.js";
import { Series } from "./series.js";

const Label = ({ name }: { name: string }) => {
	const frame = useCurrentFrame();
	const { durationInFrames, width, height } = useVideoConfig();
	return (
		<div data-label data-size={`${width}x${height}`}>
			{`${name} ${frame}/${durationInFrames}`}
		</div>
	);
};

// The tree of fixtures/compositions/src/compositions/Timeline.tsx.
const Timeline = () => (
	<AbsoluteFill>
		<Label name="root" />
		<Sequence from={10} durationInFrames={40} name="seq10">
			<Label name="seq10" />
			<Sequence from={5}>
				<Label name="nested+5" />
			</Sequence>
		</Sequence>
		<Sequence from={-5} layout="none">
			<Label name="neg5" />
		</Sequence>
		<Series>
			<Series.Sequence durationInFrames={15}>
				<Label name="s1" />
			</Series.Sequence>
			<Series.Sequence durationInFrames={20} offset={5}>
				<Label name="s2" />
			</Series.Sequence>
		</Series>
		<Loop durationInFrames={12}>
			<Label name="loop12" />
		</Loop>
		<Freeze frame={7}>
			<Label name="freeze7" />
		</Freeze>
	</AbsoluteFill>
);

let mounted: Mounted | null = null;
afterEach(() => {
	mounted?.unmount();
	mounted = null;
});

describe("timeline semantics (Remotion reference stills)", () => {
	// Read off fixtures/compositions/__golden__/remotion/timeline/*.png.
	const expected: Record<number, string[]> = {
		0: ["root 0/60", "neg5 5/65", "s1 0/15", "loop12 0/12", "freeze7 7/60"],
		14: ["root 14/60", "seq10 4/40", "neg5 19/65", "s1 14/15", "loop12 2/12", "freeze7 7/60"],
		15: ["root 15/60", "seq10 5/40", "nested+5 0/35", "neg5 20/65", "loop12 3/12", "freeze7 7/60"],
		20: [
			"root 20/60",
			"seq10 10/40",
			"nested+5 5/35",
			"neg5 25/65",
			"s2 0/20",
			"loop12 8/12",
			"freeze7 7/60",
		],
		49: [
			"root 49/60",
			"seq10 39/40",
			"nested+5 34/35",
			"neg5 54/65",
			"loop12 1/12",
			"freeze7 7/60",
		],
		50: ["root 50/60", "neg5 55/65", "loop12 2/12", "freeze7 7/60"],
		59: ["root 59/60", "neg5 64/65", "loop12 11/12", "freeze7 7/60"],
	};
	for (const [frame, labels] of Object.entries(expected)) {
		it(`frame ${frame}`, () => {
			mounted = renderAtFrame(<Timeline />, Number(frame));
			expect(texts(mounted.container)).toEqual(labels);
		});
	}

	it("gives the same result in any order on one tree", () => {
		mounted = renderAtFrame(<Timeline />, 0);
		for (const frame of [59, 20, 0, 49, 14, 50, 15]) {
			mounted.at(frame);
			expect(texts(mounted.container)).toEqual(expected[frame]);
		}
	});
});

describe("Sequence", () => {
	it("writes data-motio-from with the absolute start on its wrapper", () => {
		mounted = renderAtFrame(
			<Sequence from={10}>
				<Sequence from={5}>
					<span>x</span>
				</Sequence>
			</Sequence>,
			20,
		);
		const wrappers = mounted.container.querySelectorAll("[data-motio-from]");
		expect([...wrappers].map((w) => w.getAttribute("data-motio-from"))).toEqual(["10", "15"]);
	});

	it("applies trimBefore and playbackRate (documented example)", () => {
		const el = (
			<Sequence from={30} durationInFrames={60} trimBefore={10} playbackRate={2}>
				<Label name="c" />
			</Sequence>
		);
		mounted = renderAtFrame(el, 30);
		expect(texts(mounted.container)).toEqual(["c 10/70"]);
		mounted.at(40);
		expect(texts(mounted.container)).toEqual(["c 30/70"]);
		mounted.at(59);
		expect(texts(mounted.container)[0]).toMatch(/^c 68\//);
		mounted.at(60);
		expect(texts(mounted.container)).toEqual([]);
	});

	it("reports durationInFrames = visible frames x rate + trimBefore (documented example)", () => {
		mounted = renderAtFrame(
			<Sequence durationInFrames={40}>
				<Sequence playbackRate={2} trimBefore={10}>
					<Label name="c" />
				</Sequence>
			</Sequence>,
			0,
		);
		expect(texts(mounted.container)).toEqual(["c 10/90"]);
	});

	it("loops a trimmed, sped-up range (documented example)", () => {
		const frames: number[] = [];
		const Probe = () => {
			frames.push(useCurrentFrame());
			return null;
		};
		mounted = renderAtFrame(
			<Sequence durationInFrames={90}>
				<Sequence trimBefore={30} playbackRate={2} durationInFrames={30} loop>
					<Probe />
				</Sequence>
			</Sequence>,
			0,
			{ durationInFrames: 300 },
		);
		for (let f = 1; f < 90; f++) mounted.at(f);
		expect(frames.slice(0, 15)).toEqual([
			30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58,
		]);
		expect(frames.slice(15, 30)).toEqual(frames.slice(0, 15));
		expect(frames.length).toBe(90);
	});

	it("exposes the loop iteration to Loop.useLoop() in a looping sequence", () => {
		let info: ReturnType<typeof Loop.useLoop> = null;
		const Probe = () => {
			info = Loop.useLoop();
			return null;
		};
		mounted = renderAtFrame(
			<Sequence durationInFrames={20} loop>
				<Probe />
			</Sequence>,
			45,
		);
		expect(info).toEqual({ durationInFrames: 20, iteration: 2 });
	});

	it("freezes children with the freeze prop without changing visibility", () => {
		mounted = renderAtFrame(
			<Sequence from={10} durationInFrames={10} freeze={3}>
				<Label name="c" />
			</Sequence>,
			15,
		);
		expect(texts(mounted.container)).toEqual(["c 3/10"]);
		mounted.at(25);
		expect(texts(mounted.container)).toEqual([]);
	});

	it("overrides width and height for children and sizes the container", () => {
		mounted = renderAtFrame(
			<Sequence width={200} height={100}>
				<Label name="c" />
			</Sequence>,
			0,
		);
		const label = mounted.container.querySelector("[data-label]");
		expect(label?.getAttribute("data-size")).toBe("200x100");
		const wrapper = mounted.container.querySelector<HTMLElement>("[data-motio-from]");
		expect(wrapper?.style.width).toBe("200px");
		expect(wrapper?.style.height).toBe("100px");
	});

	it("renders nothing when hidden", () => {
		mounted = renderAtFrame(
			<Sequence hidden>
				<Label name="c" />
			</Sequence>,
			0,
		);
		expect(texts(mounted.container)).toEqual([]);
	});

	it("wraps in an absolute fill by default and not with layout none", () => {
		mounted = renderAtFrame(
			<>
				<Sequence style={{ opacity: 0.5 }} className="a">
					<span id="a" />
				</Sequence>
				<Sequence layout="none">
					<span id="b" />
				</Sequence>
			</>,
			0,
		);
		const a = mounted.container.querySelector("#a")?.parentElement as HTMLElement;
		expect(a.style.position).toBe("absolute");
		expect(a.style.opacity).toBe("0.5");
		expect(a.className).toBe("a");
		expect(
			mounted.container.querySelector("#b")?.parentElement?.hasAttribute("data-motio-from"),
		).toBe(false);
	});

	it("crops with a clip path rounded like the inline border radius", () => {
		mounted = renderAtFrame(
			<Sequence cropLeft={0.25} cropTop={0.1} style={{ borderRadius: 8 }}>
				<span />
			</Sequence>,
			0,
		);
		const wrapper = mounted.container.querySelector<HTMLElement>("[data-motio-from]");
		expect(wrapper?.style.clipPath).toBe("inset(10% 0% 0% 25% round 8px)");
	});

	it("sets overlapping opposite crops both to 50% and keeps percentages unrounded", () => {
		// Checked on the function: jsdom normalises the clip-path value it stores.
		expect(cropClipPath({ left: 0.7, right: 0.6, top: 1 / 3, bottom: 0 }, undefined)).toBe(
			`inset(${(1 / 3) * 100}% 50% 0% 50%)`,
		);
		expect(
			cropClipPath({ left: 0.1, right: 0, top: 0, bottom: 0 }, { borderTopLeftRadius: 4 }),
		).toBe("inset(0% 0% 0% 10% round 4px 0 0 0)");
	});

	it("premounts hidden at the first frame outside rendering", () => {
		mounted = renderAtFrame(
			<Sequence from={30} premountFor={10} trimBefore={4}>
				<Label name="c" />
			</Sequence>,
			22,
		);
		expect(texts(mounted.container)).toEqual(["c 4/34"]);
		const wrapper = mounted.container.querySelector<HTMLElement>("[data-motio-from]");
		expect(wrapper?.style.display).toBe("none");
		mounted.at(19);
		expect(texts(mounted.container)).toEqual([]);
	});

	it("postmounts hidden at the last frame", () => {
		mounted = renderAtFrame(
			<Sequence durationInFrames={10} postmountFor={5}>
				<Label name="c" />
			</Sequence>,
			12,
		);
		expect(texts(mounted.container)).toEqual(["c 9/10"]);
		mounted.at(15);
		expect(texts(mounted.container)).toEqual([]);
	});

	it.each([
		[{ durationInFrames: 0 }, /"durationInFrames" must be positive/],
		[{ from: Number.NaN }, /"from" must be a finite number/],
		[{ playbackRate: 0 }, /"playbackRate" must be a positive finite number/],
		[{ loop: true }, /"loop" needs a finite "durationInFrames"/],
		[{ layout: "none", style: {} }, /"style" is not allowed with layout="none"/],
		[{ layout: "none", className: "x" }, /"className" is not allowed/],
		[{ cropLeft: 2 }, /"cropLeft" must be a number between 0 and 1/],
	])("rejects invalid props %j", (props, message) => {
		expect(() => renderAtFrame(<Sequence {...(props as object)} />, 0)).toThrow(message);
	});

	it("throws outside a composition", () => {
		const Probe = () => <>{useCurrentFrame()}</>;
		expect(() => renderToStaticMarkup(<Probe />)).toThrow(/useCurrentFrame\(\) can only be called/);
	});
});

describe("Series", () => {
	it("chains sequences with offsets and playback rates", () => {
		const el = (
			<Series>
				<Series.Sequence durationInFrames={10}>
					<Label name="a" />
				</Series.Sequence>
				<Series.Sequence durationInFrames={20} playbackRate={2} offset={-2}>
					<Label name="b" />
				</Series.Sequence>
				<Series.Sequence durationInFrames={Number.POSITIVE_INFINITY}>
					<Label name="c" />
				</Series.Sequence>
			</Series>
		);
		mounted = renderAtFrame(el, 8);
		expect(texts(mounted.container)).toEqual(["a 8/10", "b 0/20"]);
		mounted.at(17);
		expect(texts(mounted.container)).toEqual(["b 18/20"]);
		mounted.at(18);
		expect(texts(mounted.container)).toEqual(["c 0/42"]);
	});

	it("flattens fragments", () => {
		mounted = renderAtFrame(
			<Series>
				<>
					<Series.Sequence durationInFrames={5}>
						<Label name="a" />
					</Series.Sequence>
				</>
				<Series.Sequence durationInFrames={5}>
					<Label name="b" />
				</Series.Sequence>
			</Series>,
			6,
		);
		expect(texts(mounted.container)).toEqual(["b 1/5"]);
	});

	it("rejects an infinite duration before the last sequence", () => {
		expect(() =>
			renderAtFrame(
				<Series>
					<Series.Sequence durationInFrames={Number.POSITIVE_INFINITY}>x</Series.Sequence>
					<Series.Sequence durationInFrames={5}>y</Series.Sequence>
				</Series>,
				0,
			),
		).toThrow(/only the last sequence may have an infinite/);
	});

	it("rejects children that are not Series.Sequence", () => {
		expect(() =>
			renderAtFrame(
				<Series>
					<div />
				</Series>,
				0,
			),
		).toThrow(/only accepts <Series.Sequence> children/);
	});
});

describe("Loop", () => {
	it("repeats a fixed number of times and exposes the iteration", () => {
		const seen: Array<[number, unknown]> = [];
		const Probe = () => {
			seen.push([useCurrentFrame(), Loop.useLoop()]);
			return null;
		};
		mounted = renderAtFrame(
			<Loop durationInFrames={50} times={3}>
				<Probe />
			</Loop>,
			75,
			{ durationInFrames: 300 },
		);
		expect(seen.at(-1)).toEqual([25, { durationInFrames: 50, iteration: 1 }]);
		seen.length = 0;
		mounted.at(150);
		expect(seen).toEqual([]);
	});

	it("cascades when nested", () => {
		mounted = renderAtFrame(
			<Loop durationInFrames={75}>
				<Loop durationInFrames={30}>
					<Label name="inner" />
				</Loop>
			</Loop>,
			140,
			{ durationInFrames: 300 },
		);
		// 140 % 75 = 65, 65 % 30 = 5; the third inner iteration is cut by the outer end (75 - 60).
		expect(texts(mounted.container)).toEqual(["inner 5/15"]);
	});

	it("returns null from useLoop outside a loop", () => {
		let info: unknown = "unset";
		const Probe = () => {
			info = Loop.useLoop();
			return null;
		};
		mounted = renderAtFrame(<Probe />, 0);
		expect(info).toBeNull();
	});
});

describe("Freeze", () => {
	it("ignores enclosing sequences and can be deactivated per frame", () => {
		mounted = renderAtFrame(
			<Sequence from={10}>
				<Freeze frame={30} active={(f) => f >= 5}>
					<Label name="c" />
				</Freeze>
			</Sequence>,
			12,
		);
		expect(texts(mounted.container)).toEqual(["c 2/50"]);
		mounted.at(20);
		expect(texts(mounted.container)).toEqual(["c 30/50"]);
	});
});

describe("AbsoluteFill", () => {
	it("has the documented default styles", () => {
		mounted = renderAtFrame(<AbsoluteFill id="f" />, 0);
		const el = mounted.container.querySelector<HTMLElement>("#f");
		const s = el?.style;
		expect([s?.position, s?.top, s?.left, s?.right, s?.bottom]).toEqual([
			"absolute",
			"0px",
			"0px",
			"0px",
			"0px",
		]);
		expect([s?.width, s?.height, s?.display, s?.flexDirection]).toEqual([
			"100%",
			"100%",
			"flex",
			"column",
		]);
	});

	it("drops defaults that a Tailwind class sets", () => {
		mounted = renderAtFrame(<AbsoluteFill id="f" className="md:flex-row relative" />, 0);
		const el = mounted.container.querySelector<HTMLElement>("#f");
		expect(el?.style.flexDirection).toBe("");
		expect(el?.style.position).toBe("");
		expect(el?.style.display).toBe("flex");
	});

	it("behaves as a sequence with timing props", () => {
		mounted = renderAtFrame(
			<AbsoluteFill from={30} durationInFrames={90} id="f">
				<Label name="c" />
			</AbsoluteFill>,
			40,
			{ durationInFrames: 200 },
		);
		expect(texts(mounted.container)).toEqual(["c 10/90"]);
		expect(mounted.container.querySelector("#f")?.getAttribute("data-motio-from")).toBe("30");
		mounted.at(120);
		expect(texts(mounted.container)).toEqual([]);
	});
});
