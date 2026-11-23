// End to end: Motio installs whisper.cpp 1.5.5 (clone and build), downloads tiny.en and
// transcribes whisper.cpp's samples/jfk.wav (a public-domain recording it ships) with every option
// set the published @remotion/install-whisper-cpp was recorded with (__oracle__/transcribe.json):
// the JSON must be the same, token for token. Opt-in, since it clones and builds whisper.cpp and
// downloads 75 MB: MOTIO_WHISPER_CPP=1 pnpm test:integration. Installs into ~/.cache/motio.
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import toCaptionsOracle from "./__oracle__/to-captions.json" with { type: "json" };
import oracle from "./__oracle__/transcribe.json" with { type: "json" };
import { downloadWhisperModel, installWhisperCpp, toCaptions, transcribe } from "./index.js";

const enabled = process.env.MOTIO_WHISPER_CPP === "1";
const whisperPath = join(homedir(), ".cache/motio", `whisper.cpp-${oracle.whisperCppVersion}`);
const input = join(whisperPath, "samples/jfk.wav");

type Case = { options: Record<string, unknown>; result?: Record<string, unknown>; error?: string };

const resolvePaths = (value: unknown): unknown =>
	JSON.parse(
		JSON.stringify(value).replaceAll("<input>", input).replaceAll("<whisperPath>", whisperPath),
	);

describe.skipIf(!enabled)("whisper.cpp end to end (MOTIO_WHISPER_CPP=1)", () => {
	it("installs whisper.cpp and the model, then finds them installed", async () => {
		await installWhisperCpp({
			to: whisperPath,
			version: oracle.whisperCppVersion,
			printOutput: false,
		});
		expect(
			await installWhisperCpp({
				to: whisperPath,
				version: oracle.whisperCppVersion,
				printOutput: false,
			}),
		).toEqual({ alreadyExisted: true });
		await downloadWhisperModel({
			model: oracle.model as "tiny.en",
			folder: whisperPath,
			printOutput: false,
		});
		expect(
			await downloadWhisperModel({
				model: oracle.model as "tiny.en",
				folder: whisperPath,
				printOutput: false,
			}),
		).toEqual({ alreadyExisted: true });
	}, 600_000);

	it("transcribes like the published package for every recorded option set", async () => {
		const cases = (oracle.cases as Case[]).filter((c) => c.result !== undefined);
		for (const c of cases) {
			const progress: number[] = [];
			const result = (await transcribe({
				inputPath: input,
				whisperPath,
				whisperCppVersion: oracle.whisperCppVersion,
				model: oracle.model as "tiny.en",
				printOutput: false,
				onProgress: (p) => progress.push(p),
				...(resolvePaths(c.options) as object),
			})) as unknown as Record<string, unknown>;
			delete result.systeminfo;
			expect(result, JSON.stringify(c.options)).toEqual(resolvePaths(c.result));
			expect(progress.at(-1)).toBe(1);
		}
		expect(cases.length).toBeGreaterThan(10);
	}, 600_000);

	it("turns the token-level transcription into the published package's captions", async () => {
		const result = await transcribe({
			inputPath: input,
			whisperPath,
			whisperCppVersion: oracle.whisperCppVersion,
			model: oracle.model as "tiny.en",
			printOutput: false,
			tokenLevelTimestamps: true,
		});
		const recorded = toCaptionsOracle.cases[0] as { output: unknown };
		expect(toCaptions({ whisperCppOutput: result })).toEqual(recorded.output);
	}, 120_000);
});
