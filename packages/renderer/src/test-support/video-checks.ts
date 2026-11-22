import { decodeFrameStamp, decodeVideoFrames, type FrameStampOptions } from "@motiojs/testing";

/** Decodes every frame of a video and returns the indices whose stamp is not the expected frame. */
export async function stampMismatches(
	file: string,
	expected: (index: number) => number,
	stamp: FrameStampOptions,
): Promise<{ frames: number; mismatches: { index: number; got: string }[] }> {
	const mismatches: { index: number; got: string }[] = [];
	let frames = 0;
	for await (const f of decodeVideoFrames(file)) {
		const r = decodeFrameStamp(f.data, f.width, f.height, stamp);
		if (!r.ok) mismatches.push({ index: f.index, got: r.reason });
		else if (r.frame !== expected(f.index))
			mismatches.push({ index: f.index, got: String(r.frame) });
		frames++;
	}
	return { frames, mismatches };
}
