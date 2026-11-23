/** Parameters of the `starburst()` effect. */
export interface StarburstEffectParams {
	rays: number;
	colors: string[];
	rotation?: number;
	smoothness?: number;
	/** Origin in UV coordinates, `[0, 0]` top left. Default `[0.5, 0.5]`. */
	origin?: [number, number];
	disabled?: boolean;
}

/**
 * Not provided by Motio: `starburst()` is an effect for the `effects` prop of canvas components
 * (`<Solid>`, `<CanvasImage>`, `<Video>`, ...), and Motio has no effect pipeline yet. Always throws;
 * `<Starburst>` draws the same rays.
 */
export function starburst(_params: StarburstEffectParams): never {
	throw new Error(
		"starburst() is an effect for the effects prop of canvas components, which Motio does not support yet. Draw the rays with <Starburst> instead.",
	);
}
