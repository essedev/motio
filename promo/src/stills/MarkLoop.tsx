import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "@motiojs/motio";
import { Mark, markPose } from "../brand/Mark";
import { CALM_SPRING, markBounds, PALETTE } from "../brand/tokens";

// The resting mark is not centred in its 64-unit box: shift it so its bounds are.
const bounds = markBounds();
const offset = { x: 32 - (bounds.x + bounds.w / 2), y: 32 - (bounds.y + bounds.h / 2) };

/** Frames of one loop: the mark plays in, rests, then folds away to where it started. */
export const MARK_LOOP_FRAMES = 96;
const FOLD_AT = 72;

/** The mark playing in a loop on Plum, for a GIF: its first and last frames are both empty. */
export const MarkLoop = () => {
	const frame = useCurrentFrame();
	const { fps, width } = useVideoConfig();
	const size = width * 0.86;
	const pose = markPose(frame, fps);
	const fold = spring({ frame, fps, delay: FOLD_AT, config: CALM_SPRING, durationInFrames: 14 });
	const shrink = spring({
		frame,
		fps,
		delay: FOLD_AT + 10,
		config: CALM_SPRING,
		durationInFrames: 12,
	});
	const angles = pose.angles.map((a) => a * (1 - fold)) as [number, number, number];
	return (
		<AbsoluteFill
			style={{ background: PALETTE.plum, justifyContent: "center", alignItems: "center" }}
		>
			<Mark
				size={size}
				pose={{ angles, scale: pose.scale * (1 - shrink) }}
				style={{ translate: `${(offset.x / 64) * size}px ${(offset.y / 64) * size}px` }}
			/>
		</AbsoluteFill>
	);
};
