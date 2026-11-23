import { cancelRender, continueRender, delayRender, useCurrentFrame } from "@motiojs/core";
import { SequenceBase, type SequenceTimingProps, useTimeline } from "@motiojs/core/internals";
import type { AnimationItem, LottiePlayer } from "lottie-web";
import * as lottieModule from "lottie-web";
import { type CSSProperties, useLayoutEffect, useRef } from "react";
import { lottieFrameAt } from "./frame.js";
import type { LottieAnimationData, LottieProps } from "./types.js";
import { validateLottieProps } from "./validate.js";

// lottie-web is CommonJS: its module object is the namespace's default export, in bundlers and
// in Node alike, while its typings describe it as an ES default export.
const lottie = (lottieModule as unknown as { default: LottiePlayer }).default;

const TIMING_KEYS = [
	"from",
	"durationInFrames",
	"trimBefore",
	"freeze",
	"hidden",
	"premountFor",
	"postmountFor",
] as const;

const HIDDEN: CSSProperties = { opacity: 0, pointerEvents: "none" };

/** Seeks lottie-web, skipping a seek to the frame it already shows. */
function seek(item: AnimationItem, value: number, backward: boolean): void {
	const state = item as AnimationItem & { __motioFrame?: number };
	item.setDirection(backward ? -1 : 1);
	if (state.__motioFrame === value) return;
	state.__motioFrame = value;
	item.goToAndStop(value, true);
}

/** Counts the image assets lottie-web loads (assets with a path and no layers). */
function hasImageAssets(data: LottieAnimationData): boolean {
	const assets = data.assets;
	return (
		Array.isArray(assets) &&
		assets.some((a) => a !== null && typeof a === "object" && "p" in a && !("layers" in a))
	);
}

type InnerProps = Omit<LottieProps, (typeof TIMING_KEYS)[number] | "name" | "showInTimeline"> & {
	trimBefore: number;
	frozen: boolean;
};

function LottieImpl(props: InnerProps) {
	const {
		animationData,
		className,
		direction,
		loop = false,
		playbackRate = 1,
		style,
		onAnimationLoaded,
		renderer = "svg",
		preserveAspectRatio,
		assetsPath,
		styleWhilePremounted,
		styleWhilePostmounted,
		trimBefore,
		frozen,
	} = props;
	const frame = useCurrentFrame();
	const { premounted, postmounted } = useTimeline("<Lottie>");
	const container = useRef<HTMLDivElement>(null);
	const animation = useRef<AnimationItem | null>(null);
	const latest = useRef({
		frame,
		loop,
		playbackRate,
		direction,
		trimBefore,
		frozen,
		onAnimationLoaded,
	});
	latest.current = { frame, loop, playbackRate, direction, trimBefore, frozen, onAnimationLoaded };

	// One animation per animationData identity and renderer options. Loading holds a readiness
	// handle until lottie-web has built the animation (and, with image assets, loaded them).
	useLayoutEffect(() => {
		const element = container.current;
		if (!element) return;
		const handle = delayRender("Loading <Lottie> animation");
		let released = false;
		const release = () => {
			if (released) return;
			released = true;
			continueRender(handle);
		};
		let item: AnimationItem;
		try {
			item = lottie.loadAnimation({
				container: element,
				autoplay: false,
				animationData,
				renderer: renderer as "svg",
				...(preserveAspectRatio !== undefined ? { rendererSettings: { preserveAspectRatio } } : {}),
				...(assetsPath !== undefined ? { assetsPath } : {}),
			});
		} catch (error) {
			release();
			cancelRender(error);
		}
		animation.current = item;
		const { frame: f, onAnimationLoaded: loaded, ...timing } = latest.current;
		seek(item, lottieFrameAt(f, item.totalFrames, timing), timing.direction === "backward");
		loaded?.(item);

		const images = hasImageAssets(animationData);
		let domLoaded = item.isLoaded;
		let imagesLoaded = !images;
		const check = () => {
			if (domLoaded && imagesLoaded) release();
		};
		const onDomLoaded = () => {
			domLoaded = true;
			check();
		};
		const onImages = () => {
			imagesLoaded = true;
			check();
		};
		const onFailed = () => {
			release();
			cancelRender(new Error("<Lottie>: lottie-web could not load the animation data."));
		};
		item.addEventListener("DOMLoaded", onDomLoaded);
		item.addEventListener("loaded_images", onImages);
		item.addEventListener("data_failed", onFailed);
		check();
		return () => {
			item.removeEventListener("DOMLoaded", onDomLoaded);
			item.removeEventListener("loaded_images", onImages);
			item.removeEventListener("data_failed", onFailed);
			item.destroy();
			animation.current = null;
			release();
		};
	}, [animationData, renderer, preserveAspectRatio, assetsPath]);

	// Every frame: seek to the frame's position, never play on the real clock.
	useLayoutEffect(() => {
		const item = animation.current;
		if (!item) return;
		const timing = { loop, playbackRate, direction, trimBefore, frozen };
		seek(item, lottieFrameAt(frame, item.totalFrames, timing), direction === "backward");
	}, [frame, loop, playbackRate, direction, trimBefore, frozen]);

	const hidden = premounted || postmounted;
	const finalStyle: CSSProperties | undefined = hidden
		? { ...style, ...HIDDEN, ...(premounted ? styleWhilePremounted : styleWhilePostmounted) }
		: style;
	return <div ref={container} className={className} style={finalStyle} />;
}

/**
 * Plays a Lottie animation in sync with the timeline: each frame seeks lottie-web to the frame's
 * position (`playbackRate` animation frames per composition frame, holding the last frame unless
 * `loop`), so nothing runs on the real clock. Rendering waits until the animation is loaded.
 * Accepts the `<Sequence>` timing props; `name` defaults to `"<Lottie>"` and the animation is
 * hidden from editor timelines unless `showInTimeline` is set.
 */
export function Lottie(props: LottieProps) {
	validateLottieProps(props);
	const timing: SequenceTimingProps = {};
	const inner: Record<string, unknown> = {};
	let timed = false;
	for (const [key, value] of Object.entries(props)) {
		if ((TIMING_KEYS as readonly string[]).includes(key)) {
			if (value !== undefined) {
				(timing as Record<string, unknown>)[key] = value;
				timed = true;
			}
		} else if (key === "name" || key === "showInTimeline") {
			if (value !== undefined) (timing as Record<string, unknown>)[key] = value;
		} else {
			inner[key] = value;
		}
	}
	const content = (
		<LottieImpl
			{...(inner as unknown as InnerProps)}
			trimBefore={props.trimBefore ?? 0}
			frozen={props.freeze !== undefined && props.freeze !== null}
		/>
	);
	if (!timed) return content;
	return (
		<SequenceBase
			name="<Lottie>"
			showInTimeline={false}
			{...timing}
			layout="none"
			componentName="Lottie"
		>
			{content}
		</SequenceBase>
	);
}
