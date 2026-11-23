// The media service checks the FFmpeg version before its first extraction, so a still or a
// frame sequence with media reports an old FFmpeg as E_FFMPEG_VERSION, as renders do.
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MEDIA_ROUTES } from "@motiojs/core/protocol";
import { afterAll, expect, it } from "vitest";
import { startMediaServer } from "./media-server.js";

const dir = mkdtempSync(join(tmpdir(), "motio-media-version-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

it("answers a frame request with E_FFMPEG_VERSION when FFmpeg is older than 5.1", async () => {
	const ffmpeg = join(dir, "ffmpeg");
	writeFileSync(
		ffmpeg,
		`#!/bin/sh\ncase "$*" in *-version*) echo "ffmpeg version 4.4.2-0ubuntu0.22.04.1";; *) echo " ------";; esac\n`,
	);
	chmodSync(ffmpeg, 0o755);
	const server = await startMediaServer({
		bundleUrl: "http://127.0.0.1:9/",
		bundleDir: null,
		ffmpeg,
		ffprobe: "ffprobe",
	});
	try {
		const url = new URL(MEDIA_ROUTES.frame, server.url);
		url.searchParams.set("src", "http://127.0.0.1:9/v.mp4");
		url.searchParams.set("t", "0");
		url.searchParams.set("mode", "floor");
		const res = await fetch(url);
		expect(res.status).toBe(500);
		expect(await res.json()).toMatchObject({ code: "E_FFMPEG_VERSION" });
	} finally {
		await server.close();
	}
});
