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
