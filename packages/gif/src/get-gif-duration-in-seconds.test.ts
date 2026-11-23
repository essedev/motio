// getGifDurationInSeconds() returns what the published package returns, or rejects with its
// message, for every recorded URL: delays, content types, a 404, a PNG, a truncated and an empty
// file (tools/oracle-render/record-gif.ts). fetch() is replaced by the recorded server's answers.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import oracle from "./__oracle__/gif.json" with { type: "json" };
import { getGifDurationInSeconds } from "./get-gif-duration-in-seconds.js";

const root = join(import.meta.dirname, "../../..");
const counter = readFileSync(join(root, "fixtures/gif/public/counter.gif"));
const bodies: Record<string, Uint8Array> = {
	"/counter.gif": counter,
	"/sprite.gif": readFileSync(join(root, "fixtures/gif/public/sprite.gif")),
};
for (const [name, base64] of Object.entries(oracle.files)) {
	bodies[`/${name}`] = Buffer.from(base64, "base64");
}
const special: Record<string, { type: string | null; body: Uint8Array; status: number }> = {
	"/not-a-gif.gif": {
		type: "image/gif",
		status: 200,
		body: readFileSync(join(root, "fixtures/compositions/public/photo.png")),
	},
	"/truncated.gif": { type: "image/gif", status: 200, body: counter.subarray(0, 2000) },
	"/empty.gif": { type: "image/gif", status: 200, body: new Uint8Array(0) },
	"/missing.gif": { type: "text/plain", status: 404, body: new TextEncoder().encode("Not Found") },
};

/** The recorder's server: /ct/<type>/<file> serves a file with a chosen content type. */
function respond(url: string): Response {
	const fixed = special[url];
	if (fixed) {
		return new Response(fixed.body, {
			status: fixed.status,
			headers: fixed.type ? { "content-type": fixed.type } : {},
		});
	}
	const typed = url.match(/^\/ct\/([^/]+)\/(.+)$/);
	if (typed) {
		const type = decodeURIComponent(typed[1] as string);
		const response = new Response(bodies[`/${typed[2]}`] as Uint8Array);
		// Response() adds no content type for binary bodies; set it or leave it absent.
		if (type !== "none") response.headers.set("content-type", type);
		return response;
	}
	return new Response(bodies[url] as Uint8Array, { headers: { "content-type": "image/gif" } });
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("getGifDurationInSeconds matches @remotion/gif", () => {
	for (const [url, expected] of Object.entries(
		oracle.durations as Record<string, { out?: number; error?: string }>,
	)) {
		it(url, async () => {
			vi.stubGlobal("fetch", async (input: string) => respond(input));
			const got = await getGifDurationInSeconds(url).then(
				(out) => ({ out }),
				(error: Error) => ({ error: `${error.name}: ${error.message}` }),
			);
			expect(got).toEqual(expected);
		});
	}

	it("passes requestInit to fetch, without its signal", async () => {
		const calls: RequestInit[] = [];
		vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
			calls.push(init);
			return respond(input);
		});
		const signal = new AbortController().signal;
		await getGifDurationInSeconds("/counter.gif", {
			requestInit: { credentials: "include", headers: { "x-a": "1" }, signal },
		});
		expect(calls[0]?.credentials).toBe("include");
		expect(calls[0]?.headers).toEqual({ "x-a": "1" });
		expect(calls[0]?.signal).not.toBe(signal);
	});
});
