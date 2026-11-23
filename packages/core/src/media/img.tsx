import {
	type CSSProperties,
	forwardRef,
	type ImgHTMLAttributes,
	type SyntheticEvent,
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { getPrefetchedUrl } from "../prefetch.js";
import { cancelRender, continueRender, delayRender } from "../readiness/delay-render.js";
import { realTimers } from "../real-time.js";
import { TimelineContext } from "../timeline/contexts.js";
import { useBufferState } from "../timeline/hooks.js";
import { SequenceBase, type SequenceTimingProps } from "../timeline/sequence.js";

/** Props of `<Img>`: the `<img>` attributes plus loading control and the timing props. */
export interface ImgProps
	extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError" | "hidden">,
		SequenceTimingProps {
	src: string;
	/** Called when loading failed and no retries are left; the render then waits for a new `src`. */
	onError?: (event: SyntheticEvent<HTMLImageElement, Event>) => void;
	/** Called with an `Error` when loading failed and no retries are left. */
	onImageError?: (error: Error) => void;
	/** Retries with exponential backoff (1 s, 2 s, 4 s, ...). Default 2. */
	maxRetries?: number;
	/** Pause the Player while the image loads. Default false. */
	pauseWhenLoading?: boolean;
	/** Timeout of the readiness handle held while loading. */
	delayRenderTimeoutInMilliseconds?: number;
	/** Retries of the readiness handle held while loading. Prefer `maxRetries`. */
	delayRenderRetries?: number;
}

const TIMING_KEYS = [
	"from",
	"durationInFrames",
	"trimBefore",
	"playbackRate",
	"loop",
	"freeze",
	"hidden",
	"premountFor",
	"postmountFor",
] as const;

const HIDDEN: CSSProperties = { display: "none", pointerEvents: "none" };

type InnerProps = Omit<ImgProps, (typeof TIMING_KEYS)[number] | "name" | "showInTimeline">;

const ImgInner = forwardRef<HTMLImageElement, InnerProps>(function ImgInner(props, ref) {
	const {
		src,
		onError,
		onImageError,
		maxRetries = 2,
		pauseWhenLoading = false,
		delayRenderTimeoutInMilliseconds,
		delayRenderRetries,
		styleWhilePremounted,
		styleWhilePostmounted,
		onLoad,
		style,
		...rest
	} = props;
	if (typeof src !== "string" || src.length === 0) {
		throw new TypeError(`<Img> needs a "src" string, got ${JSON.stringify(src)}.`);
	}
	if (!Number.isInteger(maxRetries) || maxRetries < 0) {
		throw new TypeError(`<Img>: "maxRetries" must be a non-negative integer, got ${maxRetries}.`);
	}
	const timeline = useContext(TimelineContext);
	const buffer = useBufferState();
	const premounted = timeline?.premounted === true;
	const postmounted = timeline?.postmounted === true;
	const [attempt, setAttempt] = useState(0);
	const handleRef = useRef<number | null>(null);
	const retryTimer = useRef<number | null>(null);

	const release = useCallback(() => {
		if (handleRef.current !== null) {
			continueRender(handleRef.current);
			handleRef.current = null;
		}
	}, []);

	useLayoutEffect(() => {
		const options: { timeoutInMilliseconds?: number; retries?: number } = {};
		if (delayRenderTimeoutInMilliseconds !== undefined) {
			options.timeoutInMilliseconds = delayRenderTimeoutInMilliseconds;
		}
		if (delayRenderRetries !== undefined) options.retries = delayRenderRetries;
		handleRef.current = delayRender(`Loading <Img> with src=${src}`, options);
		setAttempt(0);
		return () => {
			if (retryTimer.current !== null) realTimers().clearTimeout(retryTimer.current);
			retryTimer.current = null;
			release();
		};
	}, [src, delayRenderTimeoutInMilliseconds, delayRenderRetries, release]);

	useEffect(() => {
		if (!pauseWhenLoading || premounted || handleRef.current === null) return;
		const block = buffer.delayPlayback();
		return () => block.unblock();
	}, [pauseWhenLoading, premounted, buffer]);

	const handleLoad = (event: SyntheticEvent<HTMLImageElement, Event>) => {
		onLoad?.(event);
		const img = event.currentTarget;
		const decoded = typeof img.decode === "function" ? img.decode() : Promise.resolve();
		// A decode failure after a successful load still shows the image; release either way.
		decoded.then(release, release);
	};

	const handleError = (event: SyntheticEvent<HTMLImageElement, Event>) => {
		if (attempt < maxRetries) {
			const delay = 1000 * 2 ** attempt;
			retryTimer.current = realTimers().setTimeout(() => {
				retryTimer.current = null;
				setAttempt((a) => a + 1);
			}, delay);
			return;
		}
		const error = new Error(
			`<Img> could not load "${src}" after ${maxRetries + 1} attempts. Check that the file exists and is reachable from the render, or pass onError to handle it.`,
		);
		onImageError?.(error);
		if (onError) {
			onError(event);
			return;
		}
		try {
			cancelRender(error);
		} catch {
			// cancelRender() throws by contract; the cancellation is recorded in the readiness
			// registry and fails the frame, so rethrowing from an event handler adds nothing.
		}
	};

	const finalStyle: CSSProperties | undefined = premounted
		? { ...style, ...HIDDEN, ...styleWhilePremounted }
		: postmounted
			? { ...style, ...HIDDEN, ...styleWhilePostmounted }
			: style;
	return (
		// biome-ignore lint/a11y/useAltText: `alt` is forwarded from the props with the rest.
		<img
			{...rest}
			key={attempt}
			ref={ref}
			src={getPrefetchedUrl(src) ?? src}
			style={finalStyle}
			onLoad={handleLoad}
			onError={handleError}
		/>
	);
});

/**
 * An `<img>` that blocks the capture until the image is loaded and decoded, retries failed loads
 * and fails the render if the image cannot load (unless `onError` handles it).
 */
export const Img = forwardRef<HTMLImageElement, ImgProps>(function Img(props, ref) {
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
			(timing as Record<string, unknown>)[key] = value;
		} else {
			inner[key] = value;
		}
	}
	const img = <ImgInner {...(inner as unknown as InnerProps)} ref={ref} />;
	if (!timed) return img;
	return (
		<SequenceBase {...timing} layout="none" componentName="Img">
			{img}
		</SequenceBase>
	);
});
