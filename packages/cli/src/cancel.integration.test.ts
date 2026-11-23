// cancelRender() from a timer reports E_CANCELLED with the frame (M1 review, finding 1).
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { defaultDeps, runCli } from "./main.js";
import { testIo } from "./test-support/fakes.js";

const project = fileURLToPath(new URL("../test-fixtures/cancel/", import.meta.url));
let out: string;
beforeAll(async () => {
	out = await mkdtemp(join(tmpdir(), "motio-cli-cancel-"));
});
afterAll(() => rm(out, { recursive: true, force: true }));

it("reports cancelRender() called from a timer as E_CANCELLED with its frame", async () => {
	for (let run = 0; run < 3; run++) {
		const io = testIo(project);
		const code = await runCli(
			["still", "src/index.tsx", "cancel", join(out, "c.png"), "--frame=4", "--json"],
			io,
			defaultDeps(process.env),
		);
		const result = JSON.parse(io.out.join("")) as {
			ok: boolean;
			error?: { code: string; message: string; context: { frame?: number } };
		};
		expect(code).toBe(1);
		expect(result.error?.code).toBe("E_CANCELLED");
		expect(result.error?.message).toBe("bad data");
		expect(result.error?.context.frame).toBe(4);
	}
});

it("reports a readiness timeout in a chunked render with its code, label and frame", async () => {
	const io = testIo(project);
	const code = await runCli(
		[
			"render",
			"src/index.tsx",
			"hang",
			join(out, "hang.mp4"),
			"--chunks=2",
			"--timeout=1000",
			"--json",
		],
		io,
		defaultDeps(process.env),
	);
	const result = JSON.parse(io.out.join("")) as {
		ok: boolean;
		error?: {
			code: string;
			message: string;
			context: { frame?: number; label?: string; details?: { chunk?: unknown } };
		};
	};
	expect(code).toBe(1);
	expect(result.error?.code).toBe("E_READINESS_TIMEOUT");
	expect(result.error?.context.label).toBe("fixture: data that never arrives");
	expect(result.error?.context.frame).toBe(5);
	expect(result.error?.message).toContain("Chunk 1 (frames 5 to 9)");
	expect(result.error?.context.details?.chunk).toEqual({ index: 1, start: 5, end: 9 });
}, 60_000);
