import { spawn, spawnSync } from "node:child_process";
import { decodeFrameStamp, type FrameStampOptions, probeVideo } from "@motiojs/testing";

/**
 * Decodes every frame of a video and returns the indices whose stamp is not the expected frame.
 * Frames are decoded as stored (`-fps_mode passthrough`): a container whose audio starts before
 * the video (AAC priming in Matroska) must not make the decoder duplicate the first frame.
 */
export async function stampMismatches(
	file: string,
	expected: (index: number) => number,
	stamp: FrameStampOptions,
): Promise<{ frames: number; mismatches: { index: number; got: string }[] }> {
	const { width, height } = await probeVideo(file);
	const mismatches: { index: number; got: string }[] = [];
	const frames = await decodeRgba(file, width, height);
	frames.forEach((data, index) => {
		const r = decodeFrameStamp(data, width, height, stamp);
		if (!r.ok) mismatches.push({ index, got: r.reason });
		else if (r.frame !== expected(index)) mismatches.push({ index, got: String(r.frame) });
	});
	return { frames: frames.length, mismatches };
}

/** Decodes every frame to RGBA (BT.709, limited range in), with an explicit decoder for alpha. */
export async function decodeRgba(
	file: string,
	width: number,
	height: number,
	decoder?: string,
): Promise<Uint8Array[]> {
	const args = [
		"-v",
		"error",
		...(decoder ? ["-c:v", decoder] : []),
		"-i",
		file,
		// GIF delays are whole centiseconds: never duplicate frames to a constant rate.
		"-fps_mode",
		"passthrough",
		"-vf",
		"scale=in_color_matrix=bt709:in_range=tv:out_range=pc:flags=accurate_rnd+full_chroma_int,format=rgba",
		"-f",
		"rawvideo",
		"-",
	];
	const data = await new Promise<Buffer>((resolve, reject) => {
		const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
		const out: Buffer[] = [];
		const err: Buffer[] = [];
		child.stdout.on("data", (c: Buffer) => out.push(c));
		child.stderr.on("data", (c: Buffer) => err.push(c));
		child.on("error", reject);
		child.on("close", (code) =>
			code === 0
				? resolve(Buffer.concat(out))
				: reject(new Error(`ffmpeg exited with ${code}: ${Buffer.concat(err).toString()}`)),
		);
	});
	const size = width * height * 4;
	return Array.from(
		{ length: data.length / size },
		(_, i) => new Uint8Array(data.subarray(i * size, (i + 1) * size)),
	);
}

/**
 * Largest alpha difference over the rows `[from, to)` (default all), and largest colour
 * difference over pixels opaque in `reference` whose neighbours within `margin` pixels are opaque
 * too (4:2:0 chroma subsampling mixes the colour of transparent neighbours into edge pixels).
 */
export function alphaErrors(
	reference: Uint8Array,
	decoded: Uint8Array,
	width: number,
	options: { rows?: readonly [number, number]; margin?: number } = {},
): { alpha: number; colour: number } {
	const height = reference.length / 4 / width;
	const [fromRow, toRow] = options.rows ?? [0, height];
	const margin = options.margin ?? 0;
	const opaque = (x: number, y: number) =>
		x < 0 || y < 0 || x >= width || y >= height || reference[(y * width + x) * 4 + 3] === 255;
	let alpha = 0;
	let colour = 0;
	for (let y = fromRow; y < toRow; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			alpha = Math.max(alpha, Math.abs((reference[i + 3] ?? 0) - (decoded[i + 3] ?? 0)));
			let inside = reference[i + 3] === 255;
			for (let dy = -margin; inside && dy <= margin; dy++) {
				for (let dx = -margin; inside && dx <= margin; dx++) inside = opaque(x + dx, y + dy);
			}
			if (!inside) continue;
			for (let c = 0; c < 3; c++) {
				colour = Math.max(colour, Math.abs((reference[i + c] ?? 0) - (decoded[i + c] ?? 0)));
			}
		}
	}
	return { alpha, colour };
}

/** Loop count in a GIF's NETSCAPE2.0 extension, or null when the extension is absent. */
export function gifLoopCount(gif: Buffer): number | null {
	const at = gif.indexOf("NETSCAPE2.0", 0, "latin1");
	if (at < 0) return null;
	return gif.readUInt16LE(at + 13);
}

/** `ffprobe` fields of the first stream of a type. */
export function probeStream(file: string, type: "v" | "a", fields: string): Record<string, string> {
	const r = spawnSync(
		"ffprobe",
		[
			"-v",
			"error",
			"-select_streams",
			`${type}:0`,
			"-show_entries",
			`stream=${fields}`,
			"-of",
			"json",
			file,
		],
		{ encoding: "utf8" },
	);
	const s = (JSON.parse(r.stdout) as { streams: Record<string, string>[] }).streams[0];
	return s ?? {};
}
