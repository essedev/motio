import {
	type ComponentType,
	lazy,
	type ReactNode,
	useContext,
	useLayoutEffect,
	useMemo,
	useRef,
} from "react";
import { createPortal } from "react-dom";
import { FolderContext } from "../timeline/contexts.js";
import { CompositionFrame } from "./composition-frame.js";
import { CompositionRegistryContext, CompositionSelectionContext } from "./manager.js";
import type {
	AnyComponent,
	CalculateMetadataFunction,
	RegisteredComposition,
	SchemaLike,
} from "./types.js";
import {
	validateCompositionId,
	validateFps,
	validatePositiveInteger,
	validatePropsObject,
} from "./validate.js";

// biome-ignore lint/suspicious/noExplicitAny: props are user-defined
type AnyProps = Record<string, any>;

/** Either an eagerly imported component or a lazily imported default export. */
export type CompositionComponentProps<Props extends AnyProps> =
	| { component: ComponentType<Props>; lazyComponent?: never }
	| { lazyComponent: () => Promise<{ default: ComponentType<Props> }>; component?: never };

interface CommonProps<Props extends AnyProps> {
	/** Unique id: letters, digits, CJK characters and "-". */
	id: string;
	width?: number;
	height?: number;
	/** JSON-serialisable default props. */
	defaultProps?: Props;
	/** Computes metadata and final props before rendering. */
	calculateMetadata?: CalculateMetadataFunction<Props>;
	/** A Zod object schema the props are checked against. */
	schema?: SchemaLike;
}

/** Props of `<Composition>`. */
export type CompositionProps<Props extends AnyProps = AnyProps> = CommonProps<Props> & {
	fps?: number;
	durationInFrames?: number;
} & CompositionComponentProps<Props>;

/** Props of `<Still>`: a composition of one frame, without `fps` and `durationInFrames`. */
export type StillProps<Props extends AnyProps = AnyProps> = CommonProps<Props> &
	CompositionComponentProps<Props>;

const lazyCache = new WeakMap<() => Promise<unknown>, AnyComponent>();

function lazyFor(loader: () => Promise<{ default: ComponentType<AnyProps> }>): AnyComponent {
	let component = lazyCache.get(loader);
	if (!component) {
		component = lazy(loader);
		lazyCache.set(loader, component);
	}
	return component;
}

function buildEntry(
	props: CompositionProps | StillProps,
	isStill: boolean,
	folder: string | null,
): RegisteredComposition {
	const tag = isStill ? "<Still>" : "<Composition>";
	validateCompositionId(props.id);
	const where = (field: string) => `The "${field}" of ${tag} "${props.id}"`;
	const hasComponent = props.component !== undefined;
	const hasLazy = props.lazyComponent !== undefined;
	if (hasComponent === hasLazy) {
		throw new Error(
			`${tag} "${props.id}" needs exactly one of "component" and "lazyComponent", got ${hasComponent ? "both" : "neither"}.`,
		);
	}
	const calculateMetadata = props.calculateMetadata ?? null;
	if (calculateMetadata !== null && typeof calculateMetadata !== "function") {
		throw new Error(`${where("calculateMetadata")} must be a function.`);
	}
	const extra = props as { fps?: unknown; durationInFrames?: unknown };
	const fps = isStill ? 1 : extra.fps;
	const durationInFrames = isStill ? 1 : extra.durationInFrames;
	const required: Array<[string, unknown, (v: unknown, w: string) => void]> = [
		["width", props.width, validatePositiveInteger],
		["height", props.height, validatePositiveInteger],
		["fps", fps, validateFps],
		["durationInFrames", durationInFrames, validatePositiveInteger],
	];
	for (const [field, value, check] of required) {
		if (value === undefined && calculateMetadata !== null) continue;
		if (value === undefined) {
			throw new Error(
				`${where(field)} is missing. Pass it, or compute it with "calculateMetadata".`,
			);
		}
		check(value, where(field));
	}
	const defaultProps = props.defaultProps ?? {};
	validatePropsObject(defaultProps, where("defaultProps"));
	const schema = props.schema ?? null;
	if (schema !== null && typeof schema.safeParse !== "function") {
		throw new Error(`${where("schema")} must be a Zod schema.`);
	}
	const component: AnyComponent = hasComponent
		? (props.component as AnyComponent)
		: lazyFor(props.lazyComponent as () => Promise<{ default: ComponentType<AnyProps> }>);
	return {
		id: props.id,
		width: props.width,
		height: props.height,
		fps: fps as number | undefined,
		durationInFrames: durationInFrames as number | undefined,
		defaultProps,
		calculateMetadata: calculateMetadata as CalculateMetadataFunction | null,
		schema,
		component,
		isStill,
		folder,
	};
}

function useRegisteredComposition(
	props: CompositionProps | StillProps,
	isStill: boolean,
): ReactNode {
	const registry = useContext(CompositionRegistryContext);
	const selection = useContext(CompositionSelectionContext);
	const folder = useContext(FolderContext);
	const owner = useRef<object>({});
	const entry = buildEntry(props, isStill, folder?.path ?? null);

	useLayoutEffect(() => {
		registry?.register(owner.current, entry);
	});
	const id = props.id;
	useLayoutEffect(() => {
		const token = owner.current;
		return () => registry?.unregister(token, id);
	}, [registry, id]);

	const component = entry.component;
	const content = useMemo(() => {
		if (!selection || selection.id !== id) return null;
		return (
			<CompositionFrame
				key={selection.generation}
				component={component}
				config={selection.config}
				frame={selection.frame}
			/>
		);
	}, [selection, id, component]);
	if (!content || !selection) return null;
	return createPortal(content, selection.canvas);
}

/**
 * Registers a video. When the page renders this composition, its component is mounted in the
 * canvas with the resolved config and props.
 *
 * The component must draw each frame from `useCurrentFrame()` and its props alone: frames are
 * rendered in any order, in several tabs, and retried on fresh ones. `motio check determinism
 * <entry> <id>` renders the composition in different orders and compares the pixels.
 */
export function Composition<Props extends AnyProps = AnyProps>(
	props: CompositionProps<Props>,
): ReactNode {
	return useRegisteredComposition(props as unknown as CompositionProps, false);
}

/** Registers a single-frame composition, rendered as an image. */
export function Still<Props extends AnyProps = AnyProps>(props: StillProps<Props>): ReactNode {
	return useRegisteredComposition(props as unknown as StillProps, true);
}
