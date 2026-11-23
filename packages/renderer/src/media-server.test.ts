// The media service kills the FFprobe and FFmpeg processes it started when it closes.
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { startMediaServer } from "./media-server.js";

const dir = mkdtempSync(join(tmpdir(), "motio-media-server-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

it("close() kills a probe still running and rejects it", async () => {
	const tool = join(dir, "ffprobe.sh");
	const pidFile = join(dir, "pid");
	writeFileSync(tool, `#!/bin/sh\necho $$ > "${pidFile}"\nexec sleep 30\n`);
	chmodSync(tool, 0o755);
	const server = await startMediaServer({
		bundleUrl: "http://127.0.0.1:9/",
		bundleDir: null,
		ffmpeg: "ffmpeg",
		ffprobe: tool,
	});
	const pending = server.info(join(dir, "a.mp4"));
	let pid = 0;
	for (let i = 0; i < 200 && pid === 0; i++) {
		await new Promise((r) => setTimeout(r, 10));
		try {
			pid = Number(readFileSync(pidFile, "utf8").trim());
		} catch {
			// Not written yet.
		}
	}
	expect(pid).toBeGreaterThan(0);
	await server.close();
	await expect(pending).rejects.toMatchObject({ code: "E_MEDIA_SOURCE" });
	await new Promise((r) => setTimeout(r, 50));
	expect(() => process.kill(pid, 0)).toThrow();
});
