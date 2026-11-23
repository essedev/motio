// What transcribe(), installWhisperCpp() and downloadWhisperModel() do, against the published
// package's recording (__oracle__/transcribe.json, tools/oracle/record-whisper-cpp.mjs): the
// whisper.cpp arguments for every recorded option set, the repository, revision and model URL,
// the executable per version, and the failures raised before whisper.cpp runs. The end-to-end run
// is in whisper.integration.test.ts.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareFailure } from "@motiojs/testing/oracle-errors";
import { afterAll, describe, expect, it } from "vitest";
import oracle from "./__oracle__/transcribe.json" with { type: "json" };
import { WHISPER_CPP_REPOSITORY } from "./install.js";
import { modelFileName, modelUrl } from "./models.js";
import { transcribe, whisperArgs } from "./transcribe.js";
import { gitRevision, whisperExecutable } from "./version.js";

type Case = {
	options: Record<string, unknown>;
	args: string[] | null;
	error?: string;
	errorType?: string;
};

const work = mkdtempSync(join(tmpdir(), "motio-whisper-test-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe("transcribe() arguments match @remotion/install-whisper-cpp", () => {
	it("passes whisper.cpp the recorded arguments for every option set", () => {
		const cases = (oracle.cases as Case[]).filter((c) => c.error === undefined);
		for (const c of cases) {
			const o = c.options;
			const args = whisperArgs({
				inputPath: "<input>",
				outputFile: "<output>",
				modelPath: join(
					(o.modelFolder as string | undefined) ?? "<whisperPath>",
					modelFileName(oracle.model),
				),
				model: oracle.model,
				tokenLevelTimestamps: Boolean(o.tokenLevelTimestamps),
				tokensPerItem: o.tokensPerItem === undefined ? 1 : (o.tokensPerItem as number | null),
				translateToEnglish: Boolean(o.translateToEnglish),
				language: (o.language as string | undefined) ?? null,
				splitOnWord: Boolean(o.splitOnWord),
				flashAttention: Boolean(o.flashAttention),
				additionalArgs: (o.additionalArgs as Array<string | [string, string]> | undefined) ?? [],
			});
			expect(args, JSON.stringify(o)).toEqual(c.args);
		}
		expect(cases.length).toBeGreaterThan(10);
	});

	it("clones, checks out and builds as recorded, and downloads the recorded model URL", () => {
		const [clone, checkout, make] = oracle.install.commands;
		expect(clone).toBe(`git clone ${WHISPER_CPP_REPOSITORY} <whisperPath>`);
		expect(checkout).toBe(`git checkout ${gitRevision(oracle.whisperCppVersion)}`);
		expect(make?.trim()).toBe("make");
		expect(oracle.modelDownload.urls).toEqual([modelUrl(oracle.model)]);
		expect(gitRevision("8ac5db0")).toBe("8ac5db0");
	});

	it("uses main before whisper.cpp 1.7.4 and build/bin/whisper-cli from it", () => {
		const none = () => false;
		expect(whisperExecutable("/w", "1.5.5", none)).toBe("/w/main");
		expect(whisperExecutable("/w", "1.7.3", none)).toBe("/w/main");
		expect(whisperExecutable("/w", "1.7.4", none)).toBe("/w/build/bin/whisper-cli");
		expect(whisperExecutable("/w", "1.10.0", none)).toBe("/w/build/bin/whisper-cli");
		expect(whisperExecutable("/w", "abc123", (p) => p.endsWith("whisper-cli"))).toBe(
			"/w/build/bin/whisper-cli",
		);
	});
});

describe("transcribe() fails as @remotion/install-whisper-cpp does", () => {
	const recorded = (match: (o: Record<string, unknown>) => boolean) => {
		const c = (oracle.cases as Case[]).find((x) => match(x.options));
		if (!c?.error) throw new Error("case not recorded");
		return { error: c.error, errorType: c.errorType };
	};
	const wav = (name: string, rate: number) => {
		const header = Buffer.alloc(44);
		header.write("RIFF", 0, "ascii");
		header.write("WAVE", 8, "ascii");
		header.writeUInt32LE(rate, 24);
		const path = join(work, name);
		writeFileSync(path, header);
		return path;
	};
	const base = {
		whisperPath: work,
		whisperCppVersion: "1.5.5",
		model: "tiny.en",
		printOutput: false,
	} as const;

	it("for a missing input file", async () => {
		const error = await transcribe({ ...base, inputPath: join(work, "missing.wav") }).catch(
			(e: unknown) => e,
		);
		expect(
			compareFailure(
				error,
				recorded((o) => o.inputPath === "/nonexistent.wav"),
			),
		).toBeUndefined();
	});

	it("for a file that is not a .wav", async () => {
		const path = join(work, "audio.bin");
		writeFileSync(path, "x");
		const error = await transcribe({ ...base, inputPath: path }).catch((e: unknown) => e);
		expect(
			compareFailure(
				error,
				recorded((o) => String(o.inputPath).endsWith(".bin")),
			),
		).toBeUndefined();
	});

	it("for a WAVE file that is not 16 kHz, before running whisper.cpp", async () => {
		const error = await transcribe({ ...base, inputPath: wav("44k.wav", 44100) }).catch(
			(e: unknown) => e,
		);
		expect(
			compareFailure(
				error,
				recorded((o) => String(o.inputPath).endsWith("44k.wav")),
			),
		).toBeUndefined();
		expect(String(error)).toMatch(/44100 Hz.*16 kHz/);
	});

	it("for a missing model", async () => {
		const error = await transcribe({ ...base, inputPath: wav("ok.wav", 16000) }).catch(
			(e: unknown) => e,
		);
		expect(
			compareFailure(
				error,
				recorded((o) => o.model === "base"),
			),
		).toBeUndefined();
		expect(String(error)).toMatch(/downloadWhisperModel\(\)/);
	});
});
