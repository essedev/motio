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
