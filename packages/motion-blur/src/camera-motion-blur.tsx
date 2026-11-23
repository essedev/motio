import { AbsoluteFill, Freeze, useCurrentFrame, useVideoConfig } from "@motiojs/core";
import { VideoConfigContext } from "@motiojs/core/internals";
import { type ReactNode, useContext } from "react";
import { checkCount, checkNumber } from "./validate.js";

/** Props of `<CameraMotionBlur>`. */
export interface CameraMotionBlurProps {
	/** Absolutely positioned content to blur, for example an `<AbsoluteFill>`. */
	children: ReactNode;
	/** Exposure as an angle of one frame, 0 to 360: 180 exposes half a frame. Default 180. */
	shutterAngle?: number;
	/** Copies averaged into the image. Default 10; 5 to 10 is a good range. */
	samples?: number;
}

/**
 * Motion blur like a film camera's: the children are rendered `samples` times at moments spread
 * over the exposure (`shutterAngle / 360` of a frame, after the current one) and added together
 * with `mix-blend-mode: plus-lighter`, each at `1 / samples` opacity. Children must be absolutely
 * positioned. Colours can shift, so keep `samples` low. Near the start fewer samples are used
 * (`frame / exposure` rounded, at most `samples`), and sample times stop at the composition's last frame.
 */
export function CameraMotionBlur({
	children,
	shutterAngle = 180,
	samples = 10,
}: CameraMotionBlurProps): ReactNode {
	checkCount("samples", samples);
	checkNumber("shutterAngle", shutterAngle);
	if (shutterAngle < 0 || shutterAngle > 360) {
		throw new TypeError(`"shutterAngle" must be between 0 and 360, but got ${shutterAngle}`);
	}
	const frame = useCurrentFrame();
	// Sample times stop at the composition's last frame, not the enclosing Sequence's, as in
	// Remotion (useVideoConfig() would give the Sequence's duration).
	useVideoConfig();
	const durationInFrames =
		useContext(VideoConfigContext)?.durationInFrames ?? Number.POSITIVE_INFINITY;
	const exposure = shutterAngle / 360;
	const count = exposure === 0 ? 0 : Math.min(samples, Math.round(frame / exposure));
	const blurred = count > 1;
	const layers: ReactNode[] = [];
	if (blurred) {
		for (let i = 1; i <= count; i++) {
			// Written in this order so the sample times equal Remotion's to the last bit.
			const sampleFrame = Math.min(frame - exposure * (i / count) + 1, durationInFrames - 1);
			layers.push(
				<AbsoluteFill
					key={i}
					style={{ mixBlendMode: "plus-lighter", filter: `opacity(${1 / count})` }}
				>
					<Freeze frame={sampleFrame}>{children}</Freeze>
				</AbsoluteFill>,
			);
		}
	}
	return (
		<AbsoluteFill style={{ isolation: "isolate" }}>
			<AbsoluteFill style={{ opacity: blurred ? 0 : 1 }}>{children}</AbsoluteFill>
			{layers}
		</AbsoluteFill>
	);
}
