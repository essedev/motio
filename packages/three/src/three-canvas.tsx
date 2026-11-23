import {
	cancelRender,
	continueRender,
	delayRender,
	useCurrentFrame,
	useRemotionEnvironment,
} from "@motiojs/core";
import { SequenceBase, type SequenceTimingProps } from "@motiojs/core/internals";
import {
	type CanvasProps,
	events as createPointerEvents,
	createRoot,
	extend,
	type ReconcilerRoot,
	type RootState,
	unmountComponentAtNode,
	useThree,
} from "@react-three/fiber";
import { FiberProvider, useContextBridge } from "its-fine";
import {
	Component,
	type CSSProperties,
	type ErrorInfo,
	type ReactNode,
	Suspense,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import * as THREE from "three";

/** Props of `<ThreeCanvas>`: R3F's `<Canvas>` props, a fixed size and the timing props. */
export interface ThreeCanvasProps
	extends Omit<CanvasProps, "resize" | "fallback" | "ref" | "children" | "hidden">,
		SequenceTimingProps {
	/** Width of the canvas in pixels. Required: the canvas is not measured. */
	width: number;
	/** Height of the canvas in pixels. Required: the canvas is not measured. */
	height: number;
	children?: ReactNode;
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
	"styleWhilePremounted",
	"styleWhilePostmounted",
] as const;

const ROOT_KEYS = [
	"gl",
	"scene",
	"shadows",
	"linear",
	"flat",
	"legacy",
	"orthographic",
	"frameloop",
	"dpr",
	"performance",
	"raycaster",
	"camera",
	"events",
	"eventSource",
	"eventPrefix",
	"onPointerMissed",
	"onCreated",
] as const;

type CanvasOnlyProps = Omit<
	ThreeCanvasProps,
	(typeof TIMING_KEYS)[number] | "name" | "showInTimeline"
>;

/** Rethrows errors of the three.js tree in the DOM tree, where the render reports them. */
class SceneErrorBoundary extends Component<
	{ onError: (error: unknown) => void; children: ReactNode },
	{ failed: boolean }
> {
	override state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	override componentDidCatch(error: unknown, _info: ErrorInfo) {
		this.props.onError(error);
	}
	override render() {
		return this.state.failed ? null : this.props.children;
	}
}

/**
 * Draws the scene once the three.js tree has committed the current frame, then reports it. It is
 * a sibling after the children and draws in a layout effect: after the children's layout effects,
 * before their passive effects. That is when Remotion draws too (measured on fixtures/three: a
 * camera moved in a `useEffect` is not yet applied to the first frame a page draws, in both).
 */
function FrameAdvancer({ onAdvanced }: { onAdvanced: (frame: number) => void }) {
	const frame = useCurrentFrame();
	const advance = useThree((state) => state.advance);
	useLayoutEffect(() => {
		advance(performance.now());
		onAdvanced(frame);
	}, [frame, advance, onAdvanced]);
	return null;
}

function ThreeCanvasImpl(props: CanvasOnlyProps) {
	const { width, height, children, style, ...rest } = props;
	const rootProps: Record<string, unknown> = {};
	const divProps: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(rest)) {
		if ((ROOT_KEYS as readonly string[]).includes(key)) rootProps[key] = value;
		else divProps[key] = value;
	}
	if (!(Number.isFinite(width) && width > 0) || !(Number.isFinite(height) && height > 0)) {
		throw new TypeError(
			`<ThreeCanvas> needs a positive "width" and "height" in pixels, got ${String(width)}x${String(height)}.`,
		);
	}
	// R3F's <Canvas> registers the whole THREE namespace the same way; its typings reject the
	// namespace's non-constructor exports, which extend() ignores.
	useMemo(() => extend(THREE as unknown as Parameters<typeof extend>[0]), []);
	const Bridge = useContextBridge();
	const { isRendering } = useRemotionEnvironment();
	const frame = useCurrentFrame();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const divRef = useRef<HTMLDivElement>(null);
	const rootRef = useRef<ReconcilerRoot<HTMLCanvasElement> | null>(null);
	const pending = useRef<{ frame: number; handle: number } | null>(null);
	const [error, setError] = useState<{ error: unknown } | null>(null);
	if (error) throw error.error;

	// While rendering, every frame holds the capture until the scene has been drawn for it.
	useLayoutEffect(() => {
		if (!isRendering) return;
		const handle = delayRender(`<ThreeCanvas> drawing frame ${frame}`);
		pending.current = { frame, handle };
		return () => {
			if (pending.current?.handle === handle) pending.current = null;
			continueRender(handle);
		};
	}, [frame, isRendering]);

	const onAdvanced = useCallback((advanced: number) => {
		const current = pending.current;
		if (current && current.frame === advanced) {
			pending.current = null;
			continueRender(current.handle);
		}
	}, []);

	const onError = useCallback((e: unknown) => setError({ error: e }), []);

	useLayoutEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		rootRef.current ??= createRoot(canvas);
		const root = rootRef.current;
		const userOnCreated = rootProps.onCreated as ((state: RootState) => void) | undefined;
		const eventSource = rootProps.eventSource as
			| HTMLElement
			| { current: HTMLElement | null }
			| undefined;
		const config = {
			events: createPointerEvents,
			...rootProps,
			// The scene is drawn by FrameAdvancer for each frame of a render, never on a timer.
			frameloop: isRendering ? "never" : (rootProps.frameloop ?? "always"),
			size: { width, height, top: 0, left: 0 },
			onCreated: (state: RootState) => {
				const target = eventSource && "current" in eventSource ? eventSource.current : eventSource;
				state.events.connect?.(target ?? divRef.current);
				userOnCreated?.(state);
			},
		} as Parameters<ReconcilerRoot<HTMLCanvasElement>["configure"]>[0];
		root
			.configure(config)
			.then(() => {
				root.render(
					<Bridge>
						<SceneErrorBoundary onError={onError}>
							<Suspense fallback={null}>
								{children}
								{isRendering ? <FrameAdvancer onAdvanced={onAdvanced} /> : null}
							</Suspense>
						</SceneErrorBoundary>
					</Bridge>,
				);
			})
			.catch((e: unknown) => {
				try {
					cancelRender(e);
				} catch {
					// cancelRender() throws by contract; the cancellation is recorded and fails the frame.
				}
			});
	});

	useEffect(() => {
		const canvas = canvasRef.current;
		return () => {
			if (canvas) unmountComponentAtNode(canvas);
			rootRef.current = null;
		};
	}, []);

	const pointerEvents = rootProps.eventSource ? "none" : "auto";
	const containerStyle: CSSProperties = {
		position: "relative",
		width,
		height,
		overflow: "hidden",
		pointerEvents,
		...style,
	};
	return (
		<div {...divProps} ref={divRef} style={containerStyle}>
			<canvas ref={canvasRef} style={{ display: "block" }} />
		</div>
	);
}

/**
 * A React Three Fiber canvas driven by the timeline: `useCurrentFrame()` and the other hooks work
 * inside it (every React context is bridged into the three.js tree), so animate declaratively
 * from the frame, not with `useFrame()`. While rendering, `frameloop` is forced to `"never"` and
 * the scene is drawn once per frame after the tree has committed it; textures updated
 * asynchronously should call `advance(performance.now())`. Accepts the `<Sequence>` timing props;
 * a `<Sequence>` inside it needs `layout="none"`.
 */
export function ThreeCanvas(props: ThreeCanvasProps) {
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
	const canvas = (
		<FiberProvider>
			<ThreeCanvasImpl {...(inner as unknown as CanvasOnlyProps)} />
		</FiberProvider>
	);
	if (!timed) return canvas;
	return (
		<SequenceBase
			name="<ThreeCanvas>"
			showInTimeline={false}
			{...timing}
			layout="none"
			componentName="ThreeCanvas"
		>
			{canvas}
		</SequenceBase>
	);
}
