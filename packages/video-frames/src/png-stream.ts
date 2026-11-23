const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Splits a concatenation of PNG files (FFmpeg `image2pipe` output) into single files. */
export function splitPngStream(data: Buffer): Buffer[] {
	const out: Buffer[] = [];
	let pos = 0;
	while (pos < data.length) {
		if (!data.subarray(pos, pos + 8).equals(SIGNATURE))
			throw new Error(`no PNG signature at byte ${pos}`);
		let p = pos + 8;
		for (;;) {
			if (p + 8 > data.length) throw new Error("truncated PNG stream");
			const length = data.readUInt32BE(p);
			const type = data.toString("latin1", p + 4, p + 8);
			p += 12 + length;
			if (type === "IEND") break;
		}
		out.push(data.subarray(pos, p));
		pos = p;
	}
	return out;
}

/** Chunks that tag a PNG with a colour space: `cICP`, `iCCP`, `sRGB`, `gAMA` and `cHRM`. */
const COLOUR_CHUNKS = new Set(["cICP", "iCCP", "sRGB", "gAMA", "cHRM"]);

/**
 * Removes the colour-space chunks of a PNG. FFmpeg (since 6.1) writes the source video's colour
 * tags into extracted frames (`cICP` with the BT.709 transfer, `gAMA`, `cHRM`), and Chrome
 * colour-manages tagged images: a frame drawn in an `<img>` came out darker in the mid-tones
 * than Remotion's (up to 13 code values on the TikTok template). Untagged, the decoded pixels
 * are drawn as sRGB, as Remotion's frames are.
 */
export function stripColourChunks(png: Buffer): Buffer {
	const parts: Buffer[] = [png.subarray(0, 8)];
	let p = 8;
	let stripped = false;
	while (p + 8 <= png.length) {
		const length = png.readUInt32BE(p);
		const type = png.toString("latin1", p + 4, p + 8);
		const end = p + 12 + length;
		if (COLOUR_CHUNKS.has(type)) stripped = true;
		else parts.push(png.subarray(p, end));
		p = end;
		if (type === "IEND") break;
	}
	return stripped ? Buffer.concat(parts) : png;
}
