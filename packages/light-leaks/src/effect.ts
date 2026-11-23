/** Parameters of the `lightLeak()` effect. */
export interface LightLeakEffectParams {
	seed?: number;
	hueShift?: number;
	/** From 0 to 1: reveals up to 0.5, retracts after. Default 0.5. */
	progress?: number;
	disabled?: boolean;
}

/**
 * Not provided by Motio: `lightLeak()` is an effect for the `effects` prop of canvas components
 * (`<Solid>`, `<CanvasImage>`, `<Video>`, ...), and Motio has no effect pipeline yet. Always throws;
 * `<LightLeak>` draws a light leak over the composition.
 */
export function lightLeak(_params?: LightLeakEffectParams): never {
	throw new Error(
		"lightLeak() is an effect for the effects prop of canvas components, which Motio does not support yet. Use <LightLeak> to draw a light leak instead.",
	);
}
