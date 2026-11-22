import { VideoFramesError } from "./errors.js";
import { run } from "./run.js";

/** What frame selection needs to know about a video stream. */
export interface VideoInfo {
	width: number;
	height: number;
	/** Presentation timestamps of every frame in seconds, from the stream start, ascending. */
	timestamps: number[];
}

interface ProbeJson {
	streams?: { width?: number; height?: number; start_time?: string }[];
	packets?: { pts_time?: string }[];
}

/**
 * Reads the frame timestamps of the first video stream from its packets (no decoding), so
 * selection works for variable frame rate sources too.
 */
export async function probeVideo(src: string, ffprobe = "ffprobe"): Promise<VideoInfo> {
	let json: ProbeJson;
	try {
		const out = await run(ffprobe, [
			"-v",
			"error",
			"-select_streams",
			"v:0",
			"-show_entries",
			"stream=width,height,start_time:packet=pts_time",
			"-of",
			"json",
			src,
		]);
		json = JSON.parse(out.toString()) as ProbeJson;
	} catch (e) {
		throw new VideoFramesError("E_VIDEO_PROBE", `could not probe ${src}: ${(e as Error).message}`, {
			src,
		});
	}
	const stream = json.streams?.[0];
	if (!stream?.width || !stream.height)
		throw new VideoFramesError("E_VIDEO_PROBE", `${src} has no video stream`, { src });
	const start = Number(stream.start_time ?? 0) || 0;
	const timestamps = (json.packets ?? [])
		.map((p) => Number(p.pts_time))
		.filter((t) => Number.isFinite(t))
		.map((t) => t - start)
		.sort((a, b) => a - b);
	if (timestamps.length === 0)
		throw new VideoFramesError("E_VIDEO_NO_FRAMES", `${src} has no frames`, { src });
	return { width: stream.width, height: stream.height, timestamps };
}
