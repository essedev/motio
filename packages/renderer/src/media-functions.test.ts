import { describe, expect, it } from "vitest";
import { invert, toSilentParts } from "./get-silent-parts.js";
import { audioFileExtension, toAudioCodec } from "./get-video-metadata.js";

describe("toSilentParts", () => {
	const start = (time: number) => ({ type: "start" as const, time });
	const end = (time: number) => ({ type: "end" as const, time });

	it("pairs the events and extends a silence that reaches the end of the audio to the file's end", () => {
		expect(
			toSilentParts(
				{ events: [start(1), end(2), start(5), end(6.506667)], audioEnd: 6.506667 },
				6.5,
			),
		).toEqual([
			{ startInSeconds: 1, endInSeconds: 2 },
			{ startInSeconds: 5, endInSeconds: 6.5 },
		]);
		// The audio stops before the container does (WebM: 2.0 s of Opus in 2.008 s).
		expect(toSilentParts({ events: [start(0), end(2)], audioEnd: 2 }, 2.008)).toEqual([
			{ startInSeconds: 0, endInSeconds: 2.008 },
		]);
	});

	it("closes a silence FFmpeg left open at the end, and keeps one that ends before", () => {
		expect(toSilentParts({ events: [start(3)], audioEnd: 4 }, 4)).toEqual([
			{ startInSeconds: 3, endInSeconds: 4 },
		]);
		expect(toSilentParts({ events: [start(1), end(2)], audioEnd: 4 }, 4)).toEqual([
			{ startInSeconds: 1, endInSeconds: 2 },
		]);
	});

	it("clamps to the file and drops empty parts", () => {
		expect(toSilentParts({ events: [start(-0.01), end(1)], audioEnd: 3 }, 3)).toEqual([
			{ startInSeconds: 0, endInSeconds: 1 },
		]);
		expect(toSilentParts({ events: [], audioEnd: 3 }, 3)).toEqual([]);
	});
});

describe("invert", () => {
	it("returns the parts around and between the silences", () => {
		expect(invert([], 2)).toEqual([{ startInSeconds: 0, endInSeconds: 2 }]);
		expect(invert([{ startInSeconds: 0, endInSeconds: 2 }], 2)).toEqual([]);
		expect(
			invert(
				[
					{ startInSeconds: 0, endInSeconds: 1 },
					{ startInSeconds: 3, endInSeconds: 4 },
				],
				5,
			),
		).toEqual([
			{ startInSeconds: 1, endInSeconds: 3 },
			{ startInSeconds: 4, endInSeconds: 5 },
		]);
	});
});

describe("audio codec names", () => {
	it("maps FFmpeg's names to the documented ones and the extension that holds them", () => {
		expect(toAudioCodec("pcm_s16le")).toBe("pcm-s16le");
		expect(toAudioCodec("pcm_s24le_planar")).toBe("pcm-s24le-planar");
		expect(toAudioCodec("aac")).toBe("aac");
		expect(toAudioCodec("flac")).toBe("unknown");
		expect(toAudioCodec(undefined)).toBe("unknown");
		expect(audioFileExtension("pcm-f32le")).toBe("wav");
		expect(audioFileExtension("opus")).toBe("opus");
		expect(audioFileExtension("unknown")).toBeNull();
	});
});
