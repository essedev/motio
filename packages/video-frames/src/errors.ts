/** Error codes raised by video frame probing and extraction. */
export type VideoFramesErrorCode = "E_VIDEO_PROBE" | "E_VIDEO_EXTRACT" | "E_VIDEO_NO_FRAMES";

/** A video frame failure with a stable code and the source it concerns. */
export class VideoFramesError extends Error {
	readonly code: VideoFramesErrorCode;
	readonly context: Record<string, unknown>;

	constructor(code: VideoFramesErrorCode, message: string, context: Record<string, unknown> = {}) {
		super(message);
		this.name = "VideoFramesError";
		this.code = code;
		this.context = context;
	}
}
