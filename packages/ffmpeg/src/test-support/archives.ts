import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { FFMPEG_VERSION, type FfmpegArchive, REQUIRED_ENCODERS } from "../manifest.js";

/** One entry for `tarBytes`. */
export interface FakeEntry {
	name: string;
	data?: string | Uint8Array;
	mode?: number;
	/** Tar type flag; default "0" (file), "5" for names ending in "/". */
	type?: string;
	/** Extra header fields: a pax `path` record or a GNU long name before the entry. */
	pax?: string;
	longName?: boolean;
}

function header(name: string, size: number, mode: number, type: string): Uint8Array {
	const h = new Uint8Array(512);
	const put = (s: string, at: number) => h.set(new TextEncoder().encode(s), at);
	put(name.slice(0, 99), 0);
	put(`${mode.toString(8).padStart(7, "0")}\0`, 100);
	put("0000000\0", 108);
	put("0000000\0", 116);
	put(`${size.toString(8).padStart(11, "0")}\0`, 124);
	put("00000000000\0", 136);
	put("        ", 148);
	put(type, 156);
	put("ustar\0", 257);
	put("00", 263);
	const sum = h.reduce((a, b) => a + b, 0);
	put(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
	return h;
}

function pad(data: Uint8Array): Uint8Array {
	const out = new Uint8Array(Math.ceil(data.length / 512) * 512);
	out.set(data);
	return out;
}

/** A tar archive, written by hand so tests control every header. */
export function tarBytes(entries: readonly FakeEntry[]): Uint8Array {
	const parts: Uint8Array[] = [];
	for (const e of entries) {
		const data =
			typeof e.data === "string" ? new TextEncoder().encode(e.data) : (e.data ?? new Uint8Array());
		if (e.pax) {
			const record = (len: number) => `${len} path=${e.pax}\n`;
			let len = record(0).length;
			while (record(len).length !== len) len = record(len).length;
			const body = new TextEncoder().encode(record(len));
			parts.push(header("PaxHeader", body.length, 0o644, "x"), pad(body));
		}
		if (e.longName) {
			const body = new TextEncoder().encode(`${e.name}\0`);
			parts.push(header("././@LongLink", body.length, 0o644, "L"), pad(body));
		}
		const type = e.type ?? (e.name.endsWith("/") ? "5" : "0");
		parts.push(header(e.longName ? "truncated" : e.name, data.length, e.mode ?? 0o644, type));
		parts.push(pad(data));
	}
	parts.push(new Uint8Array(1024));
	const total = parts.reduce((n, p) => n + p.length, 0);
	const out = new Uint8Array(total);
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}

/**
 * A gzipped archive laid out like a release archive, whose `ffmpeg` and `ffprobe` are shell
 * scripts printing the pinned version and the encoder list (minus `missingEncoders`).
 */
export function fakeReleaseArchive(
	options: { version?: string; missingEncoders?: string[] } = {},
): { bytes: Buffer; archive: FfmpegArchive } {
	const version = options.version ?? FFMPEG_VERSION;
	const encoders = REQUIRED_ENCODERS.filter((e) => !options.missingEncoders?.includes(e));
	const list = encoders.map((e) => ` V....D ${e.padEnd(20)} fake`).join("\\n");
	const ffmpeg = `#!/bin/sh\ncase " $* " in *" -encoders "*) printf 'Encoders:\\n V..... = Video\\n ------\\n${list}\\n';; *) echo "ffmpeg version ${version} Copyright fake";; esac\n`;
	const ffprobe = `#!/bin/sh\necho "ffprobe version ${version} Copyright fake"\n`;
	const root = "ffmpeg-fake-platform";
	const bytes = gzipSync(
		tarBytes([
			{ name: `${root}/` },
			{ name: `${root}/bin/`, type: "5" },
			{ name: `${root}/bin/ffmpeg`, data: ffmpeg, mode: 0o755 },
			{ name: `${root}/bin/ffprobe`, data: ffprobe, mode: 0o755 },
			{ name: `${root}/LICENSE.md`, data: "GPL-3.0-or-later\n" },
		]),
	);
	return {
		bytes,
		archive: {
			file: "ffmpeg-fake.tar.gz",
			sha256: createHash("sha256").update(bytes).digest("hex"),
			size: bytes.length,
		},
	};
}

/** A local HTTP server that serves `files` by name and counts requests. */
export async function serveFiles(
	files: Record<string, Uint8Array>,
): Promise<{ url: string; requests: string[]; close: () => Promise<void>; server: Server }> {
	const requests: string[] = [];
	const server = createServer((req, res) => {
		const name = decodeURIComponent((req.url ?? "/").replace(/^\/+/, ""));
		requests.push(name);
		const body = files[name];
		if (!body) {
			res.writeHead(404).end("not found");
			return;
		}
		res.writeHead(200, { "content-length": body.length }).end(body);
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address() as AddressInfo;
	return {
		url: `http://127.0.0.1:${port}`,
		requests,
		server,
		close: () => new Promise((resolve) => server.close(() => resolve())),
	};
}
