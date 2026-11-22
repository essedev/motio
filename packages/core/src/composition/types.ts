import type { ComponentType, LazyExoticComponent } from "react";

/** Arguments passed to `calculateMetadata()`. */
export interface CalculateMetadataOptions<Props> {
	/** The `defaultProps` of the composition. */
	defaultProps: Props;
	/** Default props with the input props merged over them. */
	props: Props;
	/** Aborted when the metadata is requested again before this call finished. */
	abortSignal: AbortSignal;
	compositionId: string;
	/** True during a render. */
	isRendering: boolean;
}

/** What `calculateMetadata()` may return; every field is optional. */
export interface CalculateMetadataResult<Props> {
	props?: Props;
	durationInFrames?: number;
	fps?: number;
	width?: number;
	height?: number;
	defaultCodec?: string;
	defaultOutName?: string;
	defaultVideoImageFormat?: "png" | "jpeg" | "none";
	defaultPixelFormat?: string;
	defaultProResProfile?: string;
	defaultSampleRate?: number;
}

/** Computes a composition's metadata and final props before rendering. */
export type CalculateMetadataFunction<Props = Record<string, unknown>> = (
	options: CalculateMetadataOptions<Props>,
) => CalculateMetadataResult<Props> | Promise<CalculateMetadataResult<Props>>;

/** The subset of a Zod schema Motio uses: `safeParse`. Zod itself is not a dependency. */
export interface SchemaLike {
	safeParse(value: unknown): {
		success: boolean;
		error?: { issues?: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }> };
	};
}

// biome-ignore lint/suspicious/noExplicitAny: component props are user-defined and checked at the call site
export type AnyComponent = ComponentType<any> | LazyExoticComponent<ComponentType<any>>;

/** A composition as registered by `<Composition>` or `<Still>`. */
export interface RegisteredComposition {
	id: string;
	/** Undefined only when `calculateMetadata` is expected to provide it. */
	width: number | undefined;
	height: number | undefined;
	fps: number | undefined;
	durationInFrames: number | undefined;
	defaultProps: Record<string, unknown>;
	calculateMetadata: CalculateMetadataFunction | null;
	schema: SchemaLike | null;
	component: AnyComponent;
	isStill: boolean;
	/** Slash-separated folder path, or null at the top level. */
	folder: string | null;
}
