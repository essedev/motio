import type { BufferState, RemotionEnvironment, VideoConfig } from "@motiojs/core";
import {
	BufferStateContext,
	CurrentScaleContext,
	type MediaPlayback,
	MediaPlaybackContext,
	RemotionEnvironmentContext,
	registerPlayerMount,
	rootTimelineState,
	TimelineContext,
	VideoConfigContext,
} from "@motiojs/core/internals";
import {
	Component,
	type ComponentType,
	type CSSProperties,
	type ErrorInfo,
	lazy,
	memo,
	type ReactNode,
	type RefObject,
	Suspense,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { fitScale } from "./frame-math.js";
import type {
	CompositionComponent,
	ErrorFallback,
	LazyComponentLoader,
	RenderLoading,
} from "./types.js";

/** The class every Player and Thumbnail container carries unless overridden. */
export const INTERNAL_CLASS_NAME = "__remotion-player";

/** The environment seen by `useRemotionEnvironment()` inside a Player. */
const PLAYER_ENVIRONMENT: RemotionEnvironment = {
	isStudio: false,
	isRendering: false,
	isPlayer: true,
	isReadOnlyStudio: false,
	isClientSideRendering: false,
};

/**
 * Registers the Player with core so `getRemotionEnvironment().isPlayer` is true, and returns
 * false until that happened: the composition renders only once registered.
 */
export function usePlayerMount(): boolean {
	const [mounted, setMounted] = useState(false);
	useLayoutEffect(() => {
		const unregister = registerPlayerMount();
		setMounted(true);
		return unregister;
	}, []);
	return mounted;
}

/** Resolves `component` or `lazyComponent` to something React can render. */
export function useCompositionComponent<Props>(
	component: CompositionComponent<Props> | undefined,
	lazyComponent: LazyComponentLoader<Props> | undefined,
): ComponentType<Props> {
	return useMemo(() => {
		if (lazyComponent) return lazy(lazyComponent) as unknown as ComponentType<Props>;
		return component as ComponentType<Props>;
	}, [component, lazyComponent]);
}

/**
 * A key that changes whenever the component changes, so the error boundary starts over with a
 * new component instead of keeping the previous error.
 */
export function useComponentKey(component: unknown): number {
	const state = useRef({ component, key: 0 });
	if (state.current.component !== component) {
		state.current = { component, key: state.current.key + 1 };
	}
	return state.current.key;
}

/** A measured box, in CSS pixels. */
export interface Size {
	width: number;
	height: number;
}

function measure(el: HTMLElement): Size {
	return { width: el.clientWidth, height: el.clientHeight };
}

/**
 * The content size of an element, kept up to date with a `ResizeObserver`. Before the first
 * measurement, or where layout is unavailable (0 x 0), it falls back to `fallback`.
 */
export function useElementSize(ref: RefObject<HTMLElement | null>, fallback: Size): Size {
	const [size, setSize] = useState<Size | null>(null);
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		const apply = (next: Size) =>
			setSize((prev) =>
				prev && prev.width === next.width && prev.height === next.height ? prev : next,
			);
		apply(measure(el));
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(() => apply(measure(el)));
		observer.observe(el);
		return () => observer.disconnect();
	}, [ref]);
	if (!size || size.width <= 0 || size.height <= 0) return fallback;
	return size;
}

/**
 * Styles of the outer element. Without `width` or `height` in `style` the player takes the
 * composition size; with only one of them, the other follows the aspect ratio.
 */
export function outerStyle(
	style: CSSProperties | undefined,
	compositionWidth: number,
	compositionHeight: number,
	overflowVisible: boolean,
): CSSProperties {
	const hasWidth = style?.width !== undefined;
	const hasHeight = style?.height !== undefined;
	const base: CSSProperties = {
		position: "relative",
		overflow: overflowVisible ? "visible" : "hidden",
	};
	if (!hasWidth && !hasHeight) {
		base.width = compositionWidth;
		base.height = compositionHeight;
	} else if (!hasWidth || !hasHeight) {
		base.aspectRatio = `${compositionWidth} / ${compositionHeight}`;
	}
	return { ...base, ...style };
}

/** The numeric size the outer style implies, used before layout measures the element. */
export function impliedSize(
	style: CSSProperties | undefined,
	compositionWidth: number,
	compositionHeight: number,
): Size {
	const w = typeof style?.width === "number" ? style.width : null;
	const h = typeof style?.height === "number" ? style.height : null;
	if (w !== null && h !== null) return { width: w, height: h };
	if (w !== null) return { width: w, height: (w * compositionHeight) / compositionWidth };
	if (h !== null) return { width: (h * compositionWidth) / compositionHeight, height: h };
	return { width: compositionWidth, height: compositionHeight };
}

/** Where the scaled canvas sits inside the player. */
export interface CanvasPlacement {
	scale: number;
	left: number;
	top: number;
}

/** Centers the composition in the box at the largest scale that fits. */
export function placeCanvas(box: Size, compositionWidth: number, compositionHeight: number) {
	const scale = fitScale(box.width, box.height, compositionWidth, compositionHeight);
	return {
		scale,
		left: (box.width - compositionWidth * scale) / 2,
		top: (box.height - compositionHeight * scale) / 2,
	} satisfies CanvasPlacement;
}

/** Builds the `useVideoConfig()` value of a Player or Thumbnail. */
export function makeVideoConfig(
	fps: number,
	durationInFrames: number,
	width: number,
	height: number,
	props: Record<string, unknown>,
): VideoConfig {
	return {
		id: "player-comp",
		width,
		height,
		fps,
		durationInFrames,
		defaultProps: {},
		props,
		defaultCodec: null,
		defaultOutName: null,
		defaultVideoImageFormat: null,
		defaultPixelFormat: null,
		defaultProResProfile: null,
		defaultSampleRate: null,
	};
}

/** Props of `CompositionTree`. */
interface CompositionTreeProps {
	component: ComponentType<Record<string, unknown>>;
	config: VideoConfig;
	frame: number;
	scale: number;
	buffer: BufferState;
	/** How native media plays: provided by the Player, null in a Thumbnail. */
	playback?: MediaPlayback | null;
}

/** The composition at one frame, with every context the core hooks read. */
export const CompositionTree = memo(function CompositionTree({
	component: Comp,
	config,
	frame,
	scale,
	buffer,
	playback = null,
}: CompositionTreeProps): ReactNode {
	const timeline = useMemo(
		() => rootTimelineState(frame, config.durationInFrames),
		[frame, config.durationInFrames],
	);
	return (
		<RemotionEnvironmentContext.Provider value={PLAYER_ENVIRONMENT}>
			<BufferStateContext.Provider value={buffer}>
				<VideoConfigContext.Provider value={config}>
					<CurrentScaleContext.Provider value={scale}>
						<TimelineContext.Provider value={timeline}>
							<MediaPlaybackContext.Provider value={playback}>
								<Comp {...config.props} />
							</MediaPlaybackContext.Provider>
						</TimelineContext.Provider>
					</CurrentScaleContext.Provider>
				</VideoConfigContext.Provider>
			</BufferStateContext.Provider>
		</RemotionEnvironmentContext.Provider>
	);
});

const FILL: CSSProperties = { position: "absolute", inset: 0 };

/** The scaled, centered box the composition is drawn in. */
export function ScaledCanvas({
	placement,
	compositionWidth,
	compositionHeight,
	overflowVisible,
	children,
}: {
	placement: CanvasPlacement;
	compositionWidth: number;
	compositionHeight: number;
	overflowVisible: boolean;
	children: ReactNode;
}): ReactNode {
	return (
		<div
			style={{
				position: "absolute",
				left: placement.left,
				top: placement.top,
				width: compositionWidth,
				height: compositionHeight,
				transform: `scale(${placement.scale})`,
				transformOrigin: "0 0",
				overflow: overflowVisible ? "visible" : "hidden",
			}}
		>
			{children}
		</div>
	);
}

/** Wraps children in `Suspense` showing `renderLoading` at player size, unless disabled. */
export function LoadingBoundary({
	noSuspense,
	renderLoading,
	size,
	children,
}: {
	noSuspense: boolean;
	renderLoading: RenderLoading | undefined;
	size: Size;
	children: ReactNode;
}): ReactNode {
	if (noSuspense) return children;
	const fallback = (
		<div style={FILL}>
			{renderLoading ? renderLoading({ width: size.width, height: size.height }) : null}
		</div>
	);
	return <Suspense fallback={fallback}>{children}</Suspense>;
}

function toError(value: unknown): Error {
	return value instanceof Error ? value : new Error(String(value));
}

interface ErrorBoundaryProps {
	onError: (error: Error) => void;
	fallback: ErrorFallback | undefined;
	children?: ReactNode;
}

/** Catches errors thrown while rendering the composition and shows the error fallback. */
export class CanvasErrorBoundary extends Component<ErrorBoundaryProps, { error: Error | null }> {
	override state: { error: Error | null } = { error: null };

	static getDerivedStateFromError(error: unknown): { error: Error } {
		return { error: toError(error) };
	}

	override componentDidCatch(error: unknown, _info: ErrorInfo): void {
		this.props.onError(toError(error));
	}

	override render(): ReactNode {
		const { error } = this.state;
		if (!error) return this.props.children;
		const { fallback } = this.props;
		return (
			<div style={{ ...FILL, display: "flex", alignItems: "center", justifyContent: "center" }}>
				{fallback ? (
					fallback({ error })
				) : (
					<div style={{ color: "red", fontFamily: "sans-serif", padding: 16 }}>
						{`Error: ${error.message}`}
					</div>
				)}
			</div>
		);
	}
}
