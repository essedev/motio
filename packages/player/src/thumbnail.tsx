import {
	type ForwardedRef,
	forwardRef,
	type ReactElement,
	type ReactNode,
	type Ref,
	useCallback,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import { BufferTracker } from "./buffer.js";
import {
	CanvasErrorBoundary,
	CompositionTree,
	INTERNAL_CLASS_NAME,
	impliedSize,
	LoadingBoundary,
	makeVideoConfig,
	outerStyle,
	placeCanvas,
	ScaledCanvas,
	useComponentKey,
	useCompositionComponent,
	useElementSize,
	usePlayerMount,
} from "./canvas.js";
import { PlayerEmitter } from "./emitter.js";
import type { PlayerEventTypes, ThumbnailProps, ThumbnailRef } from "./types.js";
import { validateCanvasProps, validateFrameIndex } from "./validate.js";

const EMPTY_PROPS: Record<string, unknown> = {};

function ThumbnailInner<Props extends Record<string, unknown>>(
	props: ThumbnailProps<unknown, Props>,
	ref: ForwardedRef<ThumbnailRef>,
): ReactNode {
	validateCanvasProps("Thumbnail", props);
	validateFrameIndex("Thumbnail", "frameToDisplay", props.frameToDisplay, props.durationInFrames);
	const {
		durationInFrames,
		fps,
		compositionWidth,
		compositionHeight,
		frameToDisplay,
		style,
		className,
		overrideInternalClassName,
		overflowVisible = false,
		noSuspense = false,
		errorFallback,
		renderLoading,
	} = props;

	const [emitter] = useState(() => new PlayerEmitter<PlayerEventTypes>());
	const [buffer] = useState(
		() =>
			new BufferTracker((buffering) =>
				emitter.dispatch(buffering ? "waiting" : "resume", undefined),
			),
	);
	const mounted = usePlayerMount();
	const container = useRef<HTMLDivElement | null>(null);
	const size = useElementSize(container, impliedSize(style, compositionWidth, compositionHeight));
	const placement = placeCanvas(size, compositionWidth, compositionHeight);
	const scaleRef = useRef(placement.scale);
	scaleRef.current = placement.scale;

	useImperativeHandle(
		ref,
		(): ThumbnailRef => ({
			getContainerNode: () => container.current,
			getScale: () => scaleRef.current,
			addEventListener: (name, cb) => emitter.addEventListener(name, cb),
			removeEventListener: (name, cb) => emitter.removeEventListener(name, cb),
		}),
		[emitter],
	);

	const Comp = useCompositionComponent(props.component, props.lazyComponent);
	const boundaryKey = useComponentKey(Comp);
	const inputProps = (props.inputProps ?? EMPTY_PROPS) as Record<string, unknown>;
	const config = useMemo(
		() => makeVideoConfig(fps, durationInFrames, compositionWidth, compositionHeight, inputProps),
		[fps, durationInFrames, compositionWidth, compositionHeight, inputProps],
	);
	const onError = useCallback((error: Error) => emitter.dispatch("error", { error }), [emitter]);
	const classes = [overrideInternalClassName ?? INTERNAL_CLASS_NAME, className]
		.filter(Boolean)
		.join(" ");

	return (
		<div
			ref={container}
			className={classes}
			style={outerStyle(style, compositionWidth, compositionHeight, overflowVisible)}
		>
			<CanvasErrorBoundary key={boundaryKey} onError={onError} fallback={errorFallback}>
				<LoadingBoundary noSuspense={noSuspense} renderLoading={renderLoading} size={size}>
					<ScaledCanvas
						placement={placement}
						compositionWidth={compositionWidth}
						compositionHeight={compositionHeight}
						overflowVisible={overflowVisible}
					>
						{mounted ? (
							<CompositionTree
								component={Comp as never}
								config={config}
								frame={frameToDisplay}
								scale={placement.scale}
								buffer={buffer.state}
							/>
						) : null}
					</ScaledCanvas>
				</LoadingBoundary>
			</CanvasErrorBoundary>
		</div>
	);
}

/** Renders one frame of a composition, scaled to fit, without playback. */
export const Thumbnail = forwardRef(ThumbnailInner) as <
	Schema = unknown,
	Props extends Record<string, unknown> = Record<string, unknown>,
>(
	props: ThumbnailProps<Schema, Props> & { ref?: Ref<ThumbnailRef> },
) => ReactElement;
