import type { Alignment, Fit, RiveCanvas } from "@rive-app/canvas-advanced";

/** How the artboard is scaled into the canvas. */
export type RemotionRiveCanvasFit =
	| "contain"
	| "cover"
	| "fill"
	| "fit-height"
	| "none"
	| "scale-down"
	| "fit-width";

/** Where the artboard is placed in the canvas. */
export type RemotionRiveCanvasAlignment =
	| "center"
	| "bottom-center"
	| "bottom-left"
	| "bottom-right"
	| "center-left"
	| "center-right"
	| "top-center"
	| "top-left"
	| "top-right";

const FITS = {
	contain: "contain",
	cover: "cover",
	fill: "fill",
	"fit-height": "fitHeight",
	none: "none",
	"scale-down": "scaleDown",
	"fit-width": "fitWidth",
} as const satisfies Record<RemotionRiveCanvasFit, string>;

const ALIGNMENTS = {
	center: "center",
	"bottom-center": "bottomCenter",
	"bottom-left": "bottomLeft",
	"bottom-right": "bottomRight",
	"center-left": "centerLeft",
	"center-right": "centerRight",
	"top-center": "topCenter",
	"top-left": "topLeft",
	"top-right": "topRight",
} as const satisfies Record<RemotionRiveCanvasAlignment, string>;

const quoted = (values: object) =>
	Object.keys(values)
		.map((v) => `"${v}"`)
		.join(", ");

/** The runtime's `Fit` value for a fit name; throws for an unknown name. */
export function riveFit(rive: RiveCanvas, fit: string): Fit {
	if (!Object.hasOwn(FITS, fit)) {
		throw new Error(
			`<RemotionRiveCanvas>: fit is ${JSON.stringify(fit)}; use one of ${quoted(FITS)}.`,
		);
	}
	return rive.Fit[FITS[fit as RemotionRiveCanvasFit]];
}

/** The runtime's `Alignment` value for an alignment name; throws for an unknown name. */
export function riveAlignment(rive: RiveCanvas, alignment: string): Alignment {
	if (!Object.hasOwn(ALIGNMENTS, alignment)) {
		throw new Error(
			`<RemotionRiveCanvas>: alignment is ${JSON.stringify(alignment)}; use one of ${quoted(ALIGNMENTS)}.`,
		);
	}
	return rive.Alignment[ALIGNMENTS[alignment as RemotionRiveCanvasAlignment]];
}
