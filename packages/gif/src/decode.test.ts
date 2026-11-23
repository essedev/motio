// decodeGif() gives the published @remotion/gif's frames byte for byte: sizes, delays and a hash
// of every composed RGBA frame, for the fixture GIFs, the recorded grid and broken inputs
// (tools/oracle-render/record-gif.ts).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import oracle from "./__oracle__/gif.json" with { type: "json" };
import { decodeGif } from "./decode.js";

const root = join(import.meta.dirname, "../../..");
const counter = readFileSync(join(root, "fixtures/gif/public/counter.gif"));
const files: Record<string, Uint8Array> = {
	"/counter.gif": counter,
	"/sprite.gif": readFileSync(join(root, "fixtures/gif/public/sprite.gif")),
	"/truncated.gif": counter.subarray(0, 2000),
	"/not-a-gif.gif": readFileSync(join(root, "fixtures/compositions/public/photo.png")),
};
for (const [name, base64] of Object.entries(oracle.files)) {
	files[`/${name}`] = Buffer.from(base64, "base64");
}

/** FNV-1a over the bytes, as 8 hex digits (as the recorder hashes ImageData). */
const hash = (bytes: Uint8ClampedArray) => {
	let value = 0x811c9dc5;
	for (const byte of bytes) value = Math.imul(value ^ byte, 0x01000193) >>> 0;
	return value.toString(16).padStart(8, "0");
};

type Load = { width: number; height: number; delays: number[]; frames: string[] };

describe("decodeGif matches @remotion/gif", () => {
	for (const [url, load] of Object.entries(oracle.loads as Record<string, Load>)) {
		const bytes = files[url];
		if (!bytes || !("frames" in load)) continue;
		it(url, () => {
			const gif = decodeGif(bytes);
			expect({
				width: gif.width,
				height: gif.height,
				delays: gif.delays,
				frames: gif.frames.map((f) => `${gif.width}x${gif.height}:${hash(f)}`),
			}).toEqual({
				width: load.width,
				height: load.height,
				delays: load.delays,
				frames: load.frames,
			});
		});
	}

	it("decodes an empty file to no frames", () => {
		expect(decodeGif(new Uint8Array(0))).toEqual({ width: 0, height: 0, delays: [], frames: [] });
	});
});
