import { AbsoluteFill, continueRender, delayRender, useVideoConfig } from "@motiojs/core";
import {
	type ComponentType,
	type CSSProperties,
	type ReactNode,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import type { TransitionPresentationComponentProps } from "../types.js";
import { type DrawableCanvas, type DrawableContext2D, isHtmlInCanvasAvailable } from "./dom.js";
import type { HtmlInCanvasShader } from "./make-html-in-canvas-presentation.js";
import type { HtmlInCanvasRegistry } from "./registry.js";

/**
 * What a scene's canvas does on the current frame:
 * - `source`: it is the exiting scene of a transition that is playing; it hands its image to the
 *   entering scene and shows nothing itself;
 * - `blend`: it is the entering scene of a transition that is playing; it draws the shader on its
 *   image and the exiting scene's;
 * - `alone`: no transition is playing; it draws the shader on its own image, as the entering
 *   (`prev`) or exiting (`next`) image with `time` 0.
 */
export type HtmlInCanvasRole =
	| { kind: "source"; key: string }
	| { kind: "blend"; key: string; time: number }
	| { kind: "alone"; side: "prev" | "next" };

/** Props of `<HtmlInCanvasScene>`. */
export interface HtmlInCanvasSceneProps<Props> {
	children?: ReactNode;
	shader: HtmlInCanvasShader<Props>;
	passedProps: Props;
	presentationDurationInFrames: number;
	role: HtmlInCanvasRole;
	registry: HtmlInCanvasRegistry | null;
	/** The frame of the series; images captured for the same token belong to the same frame. */
	token: number;
}

type ShaderInstance<Props> = ReturnType<HtmlInCanvasShader<Props>>;

interface Resolved<Props> extends HtmlInCanvasSceneProps<Props> {
	width: number;
	height: number;
	pixelRatio: number;
}

const FILL: CSSProperties = { width: "100%", height: "100%", position: "absolute", inset: 0 };
const HIDDEN_STYLE: CSSProperties = { ...FILL, visibility: "hidden" };
const DRAWABLE_STYLE: CSSProperties = { ...FILL, visibility: "visible" };
const OUTPUT_STYLE: CSSProperties = { ...FILL, pointerEvents: "none" };

const DELAY_LABEL = "Drawing a scene of an HTML-in-canvas transition";

/** The per-scene state that outlives renders: images, the shader, the readiness handle. */
class SceneDrawer<Props> {
	props: Resolved<Props> | null = null;
	hidden: DrawableCanvas | null = null;
	element: HTMLDivElement | null = null;
	output: HTMLCanvasElement | null = null;
	#image: OffscreenCanvas | null = null;
	#imageToken: number | null = null;
	#target: OffscreenCanvas | null = null;
	#shader: HtmlInCanvasShader<Props> | null = null;
	#instance: ShaderInstance<Props> | null = null;
	#handle: number | null = null;
	#subscription: { key: string; registry: HtmlInCanvasRegistry; stop: () => void } | null = null;

	/** Called after every commit: the frame may have changed, so capture and draw again. */
	commit(props: Resolved<Props>): void {
		this.props = props;
		this.#syncSubscription();
		const hidden = this.hidden;
		if (!hidden) return;
		// A canvas that is not rendered (inside a `display: none` premounted sequence) gets no paint
		// event; there is nothing to show, so the frame does not wait for it.
		const rendered = hidden.getClientRects().length > 0;
		if (rendered && this.#handle === null) this.#handle = delayRender(DELAY_LABEL);
		hidden.requestPaint();
	}

	/** The `paint` event of the hidden canvas: rasterise the scene, then draw or hand it over. */
	paint(): void {
		const { hidden, element, props } = this;
		if (!hidden || !element || !props) return;
		const context = hidden.getContext("2d") as DrawableContext2D | null;
		if (!context) throw new Error("<TransitionSeries>: could not get a 2D context for a scene.");
		context.setTransform(1, 0, 0, 1, 0, 0);
		context.clearRect(0, 0, hidden.width, hidden.height);
		context.drawElementImage(element, 0, 0);
		const image = this.#sized(this.#image, hidden.width, hidden.height);
		this.#image = image;
		const copy = image.getContext("2d");
		if (!copy) throw new Error("<TransitionSeries>: could not get a 2D context for a scene image.");
		copy.clearRect(0, 0, image.width, image.height);
		copy.drawImage(hidden, 0, 0);
		this.#imageToken = props.token;
		this.update();
	}

	/** Draws (or hands over) the current frame once every image it needs is captured. */
	update(): void {
		const { props, output } = this;
		const image = this.#image;
		if (!props || !output || !image || this.#imageToken !== props.token) return;
		const instance = this.#ensureInstance(props);
		const { role } = props;
		if (role.kind === "source") {
			props.registry?.publish(role.key, image, props.token);
			instance.clear();
			output.getContext("2d")?.clearRect(0, 0, output.width, output.height);
			this.#release();
			return;
		}
		let prevImage: OffscreenCanvas | null = null;
		let nextImage: OffscreenCanvas | null = null;
		let time = 0;
		if (role.kind === "blend") {
			nextImage = props.registry?.get(role.key, props.token) ?? null;
			if (!nextImage) return; // The exiting scene publishes later and calls update() again.
			prevImage = image;
			time = role.time;
		} else if (role.side === "prev") {
			prevImage = image;
		} else {
			nextImage = image;
		}
		const target = this.#target as OffscreenCanvas;
		if (target.width !== props.width) target.width = props.width;
		if (target.height !== props.height) target.height = props.height;
		instance.draw({
			prevImage,
			nextImage,
			width: props.width,
			height: props.height,
			time,
			pixelRatio: props.pixelRatio,
			presentationDurationInFrames: props.presentationDurationInFrames,
			passedProps: props.passedProps,
		});
		const context = output.getContext("2d");
		if (!context) throw new Error("<TransitionSeries>: could not get a 2D context for a scene.");
		context.clearRect(0, 0, output.width, output.height);
		context.drawImage(target, 0, 0);
		this.#release();
	}

	dispose(): void {
		this.#subscription?.stop();
		this.#subscription = null;
		this.#instance?.cleanup();
		this.#instance = null;
		this.#release();
	}

	#ensureInstance(props: Resolved<Props>): ShaderInstance<Props> {
		if (this.#instance && this.#shader === props.shader) return this.#instance;
		this.#instance?.cleanup();
		this.#target = new OffscreenCanvas(1, 1);
		this.#shader = props.shader;
		this.#instance = props.shader(this.#target);
		return this.#instance;
	}

	#sized(canvas: OffscreenCanvas | null, width: number, height: number): OffscreenCanvas {
		if (!canvas) return new OffscreenCanvas(width, height);
		if (canvas.width !== width) canvas.width = width;
		if (canvas.height !== height) canvas.height = height;
		return canvas;
	}

	#syncSubscription(): void {
		const props = this.props;
		const wanted = props?.role.kind === "blend" && props.registry ? props.role.key : null;
		const current = this.#subscription;
		if (current && current.key === wanted && current.registry === props?.registry) return;
		current?.stop();
		this.#subscription = null;
		if (wanted !== null && props?.registry) {
			const registry = props.registry;
			this.#subscription = {
				key: wanted,
				registry,
				stop: registry.subscribe(wanted, () => this.update()),
			};
		}
	}

	#release(): void {
		if (this.#handle === null) return;
		const handle = this.#handle;
		this.#handle = null;
		continueRender(handle);
	}
}

let warnedUnavailable = false;

/**
 * One scene next to an HTML-in-canvas transition: laid out inside a hidden canvas through Chrome's
 * HTML-in-canvas API, rasterised on every frame and drawn through the shader on a second canvas.
 * Without the API (other browsers) the scene is shown as it is, without the transition.
 */
export function HtmlInCanvasScene<Props>(props: HtmlInCanvasSceneProps<Props>): ReactNode {
	const [available] = useState(isHtmlInCanvasAvailable);
	if (!available) {
		if (!warnedUnavailable) {
			warnedUnavailable = true;
			console.warn(
				"This browser has no HTML-in-canvas API (Chrome 157 or later has it): HTML-in-canvas transitions are shown as cuts.",
			);
		}
		return <AbsoluteFill>{props.children}</AbsoluteFill>;
	}
	return <DrawnScene {...props} />;
}

function DrawnScene<Props>(props: HtmlInCanvasSceneProps<Props>): ReactNode {
	const config = useVideoConfig();
	const pixelRatio =
		typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1;
	const width = Math.round(config.width * pixelRatio);
	const height = Math.round(config.height * pixelRatio);
	const [drawer] = useState(() => new SceneDrawer<Props>());
	const hidden = useRef<HTMLCanvasElement | null>(null);
	const element = useRef<HTMLDivElement | null>(null);
	const output = useRef<HTMLCanvasElement | null>(null);

	useLayoutEffect(() => {
		const canvas = hidden.current as DrawableCanvas | null;
		drawer.hidden = canvas;
		drawer.element = element.current;
		drawer.output = output.current;
		if (canvas) canvas.onpaint = () => drawer.paint();
		return () => {
			if (canvas) canvas.onpaint = null;
			drawer.dispose();
		};
	}, [drawer]);

	useLayoutEffect(() => {
		drawer.commit({ ...props, width, height, pixelRatio });
	});

	const canvasAttributes = { content: "drawable" } as Record<string, string>;
	const drawableAttributes = { drawable: "" } as Record<string, string>;
	return (
		<AbsoluteFill>
			<canvas ref={hidden} {...canvasAttributes} width={width} height={height} style={HIDDEN_STYLE}>
				<div ref={element} {...drawableAttributes} style={DRAWABLE_STYLE}>
					{props.children}
				</div>
			</canvas>
			<canvas ref={output} width={width} height={height} style={OUTPUT_STYLE} />
		</AbsoluteFill>
	);
}

/**
 * The `component` of an HTML-in-canvas presentation, for use outside `<TransitionSeries>`: draws
 * the wrapped scene alone, as the entering or the exiting image. `<TransitionSeries>` does not use
 * it; it draws both scenes of a transition through the shader itself.
 */
export function createHtmlInCanvasComponent<Props extends Record<string, unknown>>(
	shader: HtmlInCanvasShader<Props>,
): ComponentType<TransitionPresentationComponentProps<Props>> {
	// biome-ignore lint/correctness/noComponentHookFactories: made once per shader when the presentation factory is created, never during a render.
	function CompWithShader({
		children,
		presentationDirection,
		presentationDurationInFrames,
		passedProps,
	}: TransitionPresentationComponentProps<Props>): ReactNode {
		return (
			<HtmlInCanvasScene
				shader={shader}
				passedProps={passedProps}
				presentationDurationInFrames={presentationDurationInFrames}
				role={{ kind: "alone", side: presentationDirection === "entering" ? "prev" : "next" }}
				registry={null}
				token={0}
			>
				{children}
			</HtmlInCanvasScene>
		);
	}
	return CompWithShader;
}
