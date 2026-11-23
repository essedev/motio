import {
	forwardRef,
	type IframeHTMLAttributes,
	type SyntheticEvent,
	useCallback,
	useLayoutEffect,
	useRef,
} from "react";
import { continueRender, delayRender } from "../readiness/delay-render.js";

/** Props of `<IFrame>`: the `<iframe>` attributes plus the options of its readiness handle. */
export interface IFrameProps extends IframeHTMLAttributes<HTMLIFrameElement> {
	/** Timeout of the readiness handle held until the frame has loaded. */
	delayRenderTimeoutInMilliseconds?: number;
	/** Retries of the readiness handle held until the frame has loaded. */
	delayRenderRetries?: number;
}

/**
 * An `<iframe>` that blocks the capture until the embedded page has loaded. Only animations
 * driven by `useCurrentFrame()` render deterministically, so the embedded page should not
 * animate. `referrerPolicy` defaults to `strict-origin-when-cross-origin`, as in Remotion. A page
 * that never loads holds the capture until the handle times out.
 */
export const IFrame = forwardRef<HTMLIFrameElement, IFrameProps>(function IFrame(props, ref) {
	const { delayRenderTimeoutInMilliseconds, delayRenderRetries, onLoad, ...rest } = props;
	const src = rest.src;
	const handleRef = useRef<number | null>(null);

	const release = useCallback(() => {
		if (handleRef.current !== null) {
			continueRender(handleRef.current);
			handleRef.current = null;
		}
	}, []);

	useLayoutEffect(() => {
		const options: { timeoutInMilliseconds?: number; retries?: number } = {};
		if (delayRenderTimeoutInMilliseconds !== undefined) {
			options.timeoutInMilliseconds = delayRenderTimeoutInMilliseconds;
		}
		if (delayRenderRetries !== undefined) options.retries = delayRenderRetries;
		handleRef.current = delayRender(`Loading <IFrame> with source ${String(src)}`, options);
		return release;
	}, [src, delayRenderTimeoutInMilliseconds, delayRenderRetries, release]);

	const handleLoad = (event: SyntheticEvent<HTMLIFrameElement, Event>) => {
		onLoad?.(event);
		release();
	};

	return (
		<iframe
			referrerPolicy="strict-origin-when-cross-origin"
			{...rest}
			ref={ref}
			onLoad={handleLoad}
		/>
	);
});
