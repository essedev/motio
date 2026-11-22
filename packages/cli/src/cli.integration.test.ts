import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultDeps, runCli } from "./main.js";
import { testIo, validator } from "./test-support/fakes.js";

// Real bundler, page runtime, pinned Chrome and FFmpeg on a small Remotion-style project.
const project = fileURLToPath(new URL("../test-fixtures/hello/", import.meta.url));
const validate = validator();
let out: string;

beforeAll(async () => {
	out = await mkdtemp(join(tmpdir(), "motio-cli-integration-"));
});
afterAll(() => rm(out, { recursive: true, force: true }));

async function motio(argv: string[], schema: string) {
	const io = testIo(project);
	io.env = { REMOTION_TAG: "tagged" };
	const code = await runCli([...argv, "--json"], io, defaultDeps(process.env));
	const result = JSON.parse(io.out.join("")) as Record<string, unknown>;
	expect(validate(schema, result), JSON.stringify(result).slice(0, 2000)).toBeNull();
	return { code, result };
}

describe("motio CLI end to end", () => {
	it("lists compositions", async () => {
		const { code, result } = await motio(["compositions"], "compositions");
		expect(code).toBe(0);
		expect(result.compositions).toEqual([
			{
				id: "Hello",
				width: 320,
				height: 180,
				fps: 30,
				durationInFrames: 30,
				defaultProps: { title: "hello" },
			},
		]);
	});

	it("renders a video with bt709 tags and the exact frame count", async () => {
		const output = join(out, "video.mp4");
		const { code, result } = await motio(["render", "Hello", output], "render");
		expect(code, JSON.stringify(result)).toBe(0);
		const probe = execFileSync(
			process.env.MOTIO_FFPROBE ?? "ffprobe",
			[
				"-v",
				"error",
				"-show_entries",
				"stream=width,height,nb_frames,color_space",
				"-of",
				"json",
				output,
			],
			{ encoding: "utf8" },
		);
		expect(JSON.parse(probe).streams[0]).toMatchObject({
			width: 320,
			height: 180,
			nb_frames: "30",
			color_space: "bt709",
		});
	});

	it("renders a still and a contact sheet", async () => {
		const still = await motio(["still", "Hello", join(out, "still.png"), "--frame=-1"], "still");
		expect(still.result).toMatchObject({ ok: true, frame: 29 });
		const sheet = await motio(["frames", "Hello", join(out, "sheet.png"), "--count=4"], "frames");
		expect(sheet.result).toMatchObject({ ok: true, frames: [0, 10, 19, 29] });
		expect(existsSync(join(out, "sheet.png"))).toBe(true);
	});

	it("passes the determinism and flicker checks", async () => {
		const determinism = await motio(
			["check", "determinism", "Hello", "--frames=0-5"],
			"check-determinism",
		);
		expect(determinism.result).toMatchObject({ deterministic: true, mismatches: [] });
		const flicker = await motio(["check", "flicker", "Hello"], "check-flicker");
		expect(flicker.result).toMatchObject({ clean: true, frames: 30 });
	});

	it("reports a missing composition with a stable code", async () => {
		const { code, result } = await motio(["still", "Nope"], "still");
		expect(code).toBe(1);
		expect(result).toMatchObject({ ok: false, error: { code: "E_COMPOSITION_NOT_FOUND" } });
	});
});
