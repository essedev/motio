// Process lifetime of the frame extractor: closing it kills what it started, every run has a
// time limit, and network sources get a read timeout.
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { FrameExtractor } from "./extractor.js";
import { networkInputArgs } from "./run.js";

const dir = mkdtempSync(join(tmpdir(), "motio-run-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A stand-in for ffprobe that records its pid and arguments, then hangs. */
function hangingTool(name: string): { path: string; pidFile: string; argsFile: string } {
	const path = join(dir, `${name}.sh`);
	const pidFile = join(dir, `${name}.pid`);
	const argsFile = join(dir, `${name}.args`);
	writeFileSync(
		path,
		`#!/bin/sh\necho "$*" > "${argsFile}"\necho $$ > "${pidFile}"\nexec sleep 30\n`,
	);
	chmodSync(path, 0o755);
	return { path, pidFile, argsFile };
}

async function pidOf(file: string): Promise<number> {
	for (let i = 0; i < 200; i++) {
		try {
			const pid = Number(readFileSync(file, "utf8").trim());
			if (pid > 0) return pid;
		} catch {
			// Not written yet.
		}
		await new Promise((r) => setTimeout(r, 10));
	}
	throw new Error(`no pid in ${file}`);
}

function alive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

describe("FrameExtractor processes", () => {
	it("close() kills the processes still running and rejects their requests", async () => {
		const tool = hangingTool("close");
		const extractor = new FrameExtractor({ ffprobe: tool.path });
		const pending = extractor.info(join(dir, "a.mp4"));
		const pid = await pidOf(tool.pidFile);
		expect(alive(pid)).toBe(true);
		extractor.close();
		await expect(pending).rejects.toThrow(/stopped|closed/);
		await new Promise((r) => setTimeout(r, 50));
		expect(alive(pid)).toBe(false);
		await expect(extractor.info(join(dir, "b.mp4"))).rejects.toThrow(/closed/);
	});

	it("kills a run that takes longer than timeoutMs", async () => {
		const tool = hangingTool("timeout");
		const extractor = new FrameExtractor({ ffprobe: tool.path, timeoutMs: 1_500 });
		const t = performance.now();
		const pending = extractor.info(join(dir, "c.mp4"));
		const pid = await pidOf(tool.pidFile);
		await expect(pending).rejects.toThrow(/longer than 1500 ms/);
		expect(performance.now() - t).toBeLessThan(10_000);
		await new Promise((r) => setTimeout(r, 50));
		expect(alive(pid)).toBe(false);
	});

	it("gives network sources a read timeout", async () => {
		const tool = hangingTool("remote");
		const extractor = new FrameExtractor({ ffprobe: tool.path });
		const pending = extractor.info("https://example.com/v.mp4");
		await pidOf(tool.pidFile);
		extractor.close();
		await expect(pending).rejects.toThrow();
		expect(readFileSync(tool.argsFile, "utf8")).toContain("-rw_timeout 30000000");
		expect(networkInputArgs("/tmp/v.mp4")).toEqual([]);
		expect(networkInputArgs("file:///tmp/v.mp4")).toEqual([]);
		expect(networkInputArgs("http://127.0.0.1:3000/v.mp4")).toEqual(["-rw_timeout", "30000000"]);
	});
});
