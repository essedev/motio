// encodeAudio against the real FFmpeg: failures reject with FFmpeg's message, never crash.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { encodeAudio } from "./encode.js";

const dir = mkdtempSync(join(tmpdir(), "motio-encode-"));
afterAll(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("encodeAudio", () => {
	it("rejects with FFmpeg's error when it cannot write the output, without an EPIPE crash", async () => {
		// Two seconds of stereo float: more than a pipe buffer, so FFmpeg exits before reading it all.
		const audio = { samples: new Float32Array(48000 * 2 * 2), sampleRate: 48000, channels: 2 };
		const output = join(dir, "missing-dir", "a.aac");
		await expect(encodeAudio(audio, { output, codec: "aac" })).rejects.toMatchObject({
			code: "E_AUDIO_ENCODE",
			message: expect.stringMatching(/No such file or directory/),
		});
	});
});
