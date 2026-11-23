import { continueRender, delayRender, useCurrentFrame, useVideoConfig } from "@motiojs/core";
import {
	cropClipPath,
	SequenceBase,
	type SequenceTimingProps,
	useTimeline,
} from "@motiojs/core/internals";
import type {
	Artboard,
	CanvasRenderer,
	FileAsset,
	LinearAnimationInstance,
	RiveCanvas,
	File as RiveFile,
} from "@rive-app/canvas-advanced";
import {
	type CSSProperties,
	forwardRef,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import {
	type RemotionRiveCanvasAlignment,
	type RemotionRiveCanvasFit,
	riveAlignment,
	riveFit,
} from "./layout.js";
import { loadRiveRuntime } from "./runtime.js";
import { seekAnimation } from "./seek.js";

/** What a ref to `<RemotionRiveCanvas>` exposes: the Rive runtime objects behind the canvas. */
export interface RiveCanvasRef {
	/** The animation instance that is seeked every frame, or `null` before it is loaded. */
	getAnimationInstance(): LinearAnimationInstance | null;
	/** The artboard instance that is drawn, or `null` before it is loaded. */
	getArtboard(): Artboard | null;
	/** The 2D renderer drawing on the canvas, or `null` before it is loaded. */
	getRenderer(): CanvasRenderer | null;
	/** The Rive runtime (its classes and helpers), or `null` before it is loaded. */
	getCanvas(): RiveCanvas | null;
}

/**
 * Custom loader for the assets a Rive file references (images, fonts, audio). Return `true` when
 * it handles the asset, `false` to let the runtime do it. Memoize it with `useCallback`.
 */
export type RiveAssetLoader = (asset: FileAsset, bytes: Uint8Array) => boolean;

/** Props of `<RemotionRiveCanvas>`. */
export interface RemotionRiveCanvasProps {
	/** URL of the `.riv` file: a `staticFile()` or a remote URL served with CORS. */
	src: string;
	/** How the artboard is scaled into the canvas. Default `"contain"`. */
	fit?: RemotionRiveCanvasFit;
	/** Where the artboard is placed in the canvas. Default `"center"`. */
	alignment?: RemotionRiveCanvasAlignment;
	/** Artboard name or index. Default: the file's default artboard. */
	artboard?: string | number;
	/** Animation name or index on the artboard. Default: its first animation. */
	animation?: string | number;
	/** Called with the loaded Rive `File` (memoize it with `useCallback`). */
	onLoad?: ((file: RiveFile) => void) | null;
	/** Whether referenced assets may be downloaded from Rive's CDN. Default `true`. */
	enableRiveAssetCdn?: boolean;
	/** Custom asset loader, see {@link RiveAssetLoader}. */
	assetLoader?: RiveAssetLoader;
	/** Class of the `<canvas>`. */
	className?: string;
	/** Styles of the `<canvas>`, applied over its size. */
	style?: CSSProperties;
	/** Crop ratios between 0 and 1, applied to the canvas with a clip path. */
	cropLeft?: number;
	cropRight?: number;
	cropTop?: number;
	cropBottom?: number;
	/** Not supported by Motio yet: effects need `@remotion/effects`. Must be empty or absent. */
	effects?: readonly unknown[];
	/** Size of the effect chain's output; has no effect without `effects`. */
	effectsOutputSize?: unknown;
	/** Frame of the parent at which the animation starts. Default 0. */
	from?: number;
	/** How many frames the animation stays mounted. Default `Infinity`. */
	durationInFrames?: number;
	/** Frames of the animation's timeline skipped at its start. Default 0. */
	trimBefore?: number;
	/** Speed: 2 plays twice as fast. Positive. Default 1. */
	playbackRate?: number;
	/** Repeat the mounted range until the parent ends; needs a finite `durationInFrames`. */
	loop?: boolean;
	/** Hold the animation at this frame of its timeline. */
	freeze?: number | null;
	/** Label in an editor timeline. Default `"<RemotionRiveCanvas>"`. */
	name?: string;
	/** Whether an editor timeline shows the animation. Default `false`. */
	showInTimeline?: boolean;
	/** Do not render the animation. */
	hidden?: boolean;
	/** Mount this many frames before `from`, hidden and on the first frame (Player only). */
	premountFor?: number;
	/** Stay mounted this many frames after the end, hidden and on the last frame (Player only). */
	postmountFor?: number;
	/** Styles of the canvas while premounted, over `opacity: 0; pointer-events: none`. */
	styleWhilePremounted?: CSSProperties;
	/** Styles of the canvas while postmounted, over `opacity: 0; pointer-events: none`. */
	styleWhilePostmounted?: CSSProperties;
}

const TIMING_KEYS = [
	"from",
	"durationInFrames",
	"trimBefore",
	"playbackRate",
	"loop",
	"freeze",
	"name",
	"showInTimeline",
	"hidden",
	"premountFor",
	"postmountFor",
	"styleWhilePremounted",
	"styleWhilePostmounted",
] as const;

type InnerProps = Omit<
	RemotionRiveCanvasProps,
	(typeof TIMING_KEYS)[number] | "effects" | "effectsOutputSize"
> & {
	styleWhilePremounted: CSSProperties | undefined;
	styleWhilePostmounted: CSSProperties | undefined;
};

const HIDDEN: CSSProperties = { opacity: 0, pointerEvents: "none" };

interface Scene {
	artboard: Artboard;
	instance: LinearAnimationInstance;
	/** The instance's time when created: the start of its work area, else 0. */
	start: number;
	/** Seconds of the frame drawn last, for the artboard's own clock. */
	drawnAt: number | null;
}

const describe = (value: string | number) =>
	typeof value === "number" ? `index ${value}` : JSON.stringify(value);

function namesOf(count: number, nameAt: (i: number) => string): string {
	const names = Array.from({ length: count }, (_, i) => JSON.stringify(nameAt(i)));
	return names.length > 0 ? names.join(", ") : "none";
}

function createScene(
	rive: RiveCanvas,
	file: RiveFile,
	src: string,
	artboardProp: string | number | undefined,
	animationProp: string | number | undefined,
): Scene {
	let artboard: Artboard | null;
	if (artboardProp === undefined) artboard = file.defaultArtboard();
	else if (typeof artboardProp === "number") artboard = file.artboardByIndex(artboardProp);
	else artboard = file.artboardByName(artboardProp);
	if (!artboard) {
		const available = namesOf(file.artboardCount(), (i) => file.artboardByIndex(i).name);
		throw new TypeError(
			`<RemotionRiveCanvas>: ${src} has no artboard ${describe(artboardProp ?? 0)}. Its artboards: ${available}.`,
		);
	}
	// An animation that does not exist is passed on as the published package does: the runtime
	// then draws the artboard without animating it (recorded in __oracle__/rive.json).
	const animation =
		animationProp === undefined
			? artboard.animationByIndex(0)
			: typeof animationProp === "number"
				? artboard.animationByIndex(animationProp)
				: artboard.animationByName(animationProp);
	const instance = new rive.LinearAnimationInstance(animation, artboard);
	return { artboard, instance, start: instance.time, drawnAt: null };
}

function deleteScene(scene: Scene): void {
	scene.instance.delete();
	scene.artboard.delete();
}

type Loaded = { rive: RiveCanvas; file: RiveFile };

async function loadFile(
	src: string,
	assetLoader: RiveAssetLoader | undefined,
	enableRiveAssetCdn: boolean,
): Promise<Loaded> {
	const rive = await loadRiveRuntime();
	let response: Response;
	try {
		response = await fetch(src);
	} catch (error) {
		throw new TypeError(
			`<RemotionRiveCanvas> could not download ${src}: ${error instanceof Error ? error.message : String(error)}.`,
			{ cause: error },
		);
	}
	if (!response.ok) {
		throw new TypeError(
			`<RemotionRiveCanvas> could not download ${src}: the server answered ${response.status}. Pass a staticFile() or a URL that serves the .riv file.`,
		);
	}
	const bytes = new Uint8Array(await response.arrayBuffer());
	const loader = assetLoader
		? new rive.CustomFileAssetLoader({
				loadContents: (asset: FileAsset, contents: Uint8Array) => assetLoader(asset, contents),
			})
		: undefined;
	// The runtime resolves to null when the bytes are not a Rive file it can read.
	const file = (await rive.load(bytes, loader, enableRiveAssetCdn)) as RiveFile | null;
	if (!file) {
		throw new TypeError(
			`<RemotionRiveCanvas>: ${src} is not a Rive file this runtime can read (export it from the Rive editor as .riv).`,
		);
	}
	return { rive, file };
}

const RiveCanvasImpl = forwardRef<RiveCanvasRef, InnerProps>(function RiveCanvasImpl(props, ref) {
	const {
		src,
		fit = "contain",
		alignment = "center",
		artboard: artboardProp,
		animation: animationProp,
		onLoad,
		enableRiveAssetCdn = true,
		assetLoader,
		className,
		style,
		cropLeft = 0,
		cropRight = 0,
		cropTop = 0,
		cropBottom = 0,
		styleWhilePremounted,
		styleWhilePostmounted,
	} = props;
	const frame = useCurrentFrame();
	const { width, height, fps } = useVideoConfig();
	const { premounted, postmounted } = useTimeline("<RemotionRiveCanvas>");
	const [handle] = useState(() => delayRender(`Loading the Rive animation ${src}`));
	const [loaded, setLoaded] = useState<Loaded | null>(null);
	const [error, setError] = useState<unknown>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const sceneRef = useRef<Scene | null>(null);
	const rendererRef = useRef<CanvasRenderer | null>(null);
	const onLoadRef = useRef(onLoad);
	onLoadRef.current = onLoad;
	const notified = useRef<RiveFile | null>(null);

	useImperativeHandle(
		ref,
		() => ({
			getAnimationInstance: () => sceneRef.current?.instance ?? null,
			getArtboard: () => sceneRef.current?.artboard ?? null,
			getRenderer: () => rendererRef.current,
			getCanvas: () => loaded?.rive ?? null,
		}),
		[loaded],
	);

	// The component is keyed by src: this loads once per file, again when the loader changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useEffect(() => {
		let active = true;
		let result: Loaded | null = null;
		loadFile(src, assetLoader, enableRiveAssetCdn).then(
			(value) => {
				result = value;
				if (active) setLoaded(value);
				else value.file.unref();
			},
			(reason: unknown) => {
				if (active) setError(reason);
			},
		);
		return () => {
			active = false;
			result?.file.unref();
		};
	}, [assetLoader, enableRiveAssetCdn]);

	useEffect(() => () => continueRender(handle), [handle]);

	// The artboard and animation instance, rebuilt when the file or the selection changes; onLoad
	// is called once per file, after the artboard exists.
	useLayoutEffect(() => {
		if (!loaded) return;
		const scene = createScene(loaded.rive, loaded.file, src, artboardProp, animationProp);
		sceneRef.current = scene;
		if (notified.current !== loaded.file) {
			notified.current = loaded.file;
			onLoadRef.current?.(loaded.file);
		}
		return () => {
			sceneRef.current = null;
			deleteScene(scene);
		};
	}, [loaded, src, artboardProp, animationProp]);

	// One renderer per canvas element.
	useLayoutEffect(() => {
		const canvas = canvasRef.current;
		if (!loaded || !canvas) return;
		const renderer = loaded.rive.makeRenderer(canvas) as CanvasRenderer;
		rendererRef.current = renderer;
		return () => {
			rendererRef.current = null;
			renderer.delete();
		};
	}, [loaded]);

	// Every commit: seek the animation to this frame's time and draw it.
	useLayoutEffect(() => {
		const scene = sceneRef.current;
		const renderer = rendererRef.current;
		const canvas = canvasRef.current;
		if (!loaded || !scene || !renderer || !canvas) return;
		const fitValue = riveFit(loaded.rive, fit);
		const alignmentValue = riveAlignment(loaded.rive, alignment);
		const seconds = frame / fps;
		seekAnimation(scene.instance, scene.start, seconds);
		scene.instance.apply(1);
		// The artboard's own clock (nested artboards that play by themselves) moves by the time
		// since the frame drawn last, as in a player.
		scene.artboard.advance(scene.drawnAt === null ? seconds : seconds - scene.drawnAt);
		scene.drawnAt = seconds;
		renderer.clear();
		renderer.save();
		renderer.align(
			fitValue,
			alignmentValue,
			{ minX: 0, minY: 0, maxX: canvas.width, maxY: canvas.height },
			scene.artboard.bounds,
		);
		scene.artboard.draw(renderer);
		renderer.restore();
		loaded.rive.resolveAnimationFrame();
		continueRender(handle);
	});

	if (error !== null) throw error;

	const clip = cropClipPath(
		{ left: cropLeft, right: cropRight, top: cropTop, bottom: cropBottom },
		style,
	);
	let finalStyle: CSSProperties = { height, width, ...style };
	if (clip) finalStyle = { ...finalStyle, clipPath: clip };
	if (premounted) finalStyle = { ...finalStyle, ...HIDDEN, ...styleWhilePremounted };
	else if (postmounted) finalStyle = { ...finalStyle, ...HIDDEN, ...styleWhilePostmounted };
	return (
		<canvas
			ref={canvasRef}
			width={width}
			height={height}
			{...(className !== undefined ? { className } : {})}
			style={finalStyle}
		/>
	);
});

/**
 * Plays a Rive animation in sync with the timeline: every frame seeks the artboard's linear
 * animation to the frame's time (`frame / fps` seconds of the animation, looping as the file
 * says) and draws it on a canvas the size of the composition, so nothing runs on the real clock.
 * Rendering waits until the runtime and the file are loaded. The runtime is the official
 * `@rive-app/canvas-advanced`. Accepts the `<Sequence>` timing props; the ref exposes the Rive
 * objects ({@link RiveCanvasRef}).
 */
export const RemotionRiveCanvas = forwardRef<RiveCanvasRef, RemotionRiveCanvasProps>(
	function RemotionRiveCanvas(props, ref) {
		if (props.effects !== undefined && props.effects.length > 0) {
			throw new Error(
				"<RemotionRiveCanvas>: the effects prop needs @remotion/effects, which Motio does not provide yet. Remove it or draw the effect over the canvas.",
			);
		}
		const timing: SequenceTimingProps = {};
		const inner: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(props)) {
			if (key === "effects" || key === "effectsOutputSize") continue;
			if ((TIMING_KEYS as readonly string[]).includes(key)) {
				if (
					value !== undefined &&
					key !== "styleWhilePremounted" &&
					key !== "styleWhilePostmounted"
				) {
					(timing as Record<string, unknown>)[key] = value;
				}
			} else {
				inner[key] = value;
			}
		}
		return (
			<SequenceBase
				name="<RemotionRiveCanvas>"
				showInTimeline={false}
				{...timing}
				layout="none"
				componentName="RemotionRiveCanvas"
			>
				<RiveCanvasImpl
					key={props.src}
					{...(inner as unknown as InnerProps)}
					styleWhilePremounted={props.styleWhilePremounted}
					styleWhilePostmounted={props.styleWhilePostmounted}
					ref={ref}
				/>
			</SequenceBase>
		);
	},
);
