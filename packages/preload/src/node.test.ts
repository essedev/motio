// Outside the browser: the preload functions warn and do nothing; resolveRedirect() works with
// Node's fetch.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
	preloadAudio,
	preloadFont,
	preloadImage,
	preloadVideo,
	resolveRedirect,
} from "./preload.js";

let server: Server;
let origin = "";

beforeAll(async () => {
	server = createServer((req, res) => {
		if (req.url === "/hop") res.writeHead(302, { location: "/final" }).end();
		else res.writeHead(req.url === "/final" ? 200 : 404).end("body");
	});
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
	origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(() => {
	server.close();
});

describe("in Node", () => {
	it("each preload function warns and returns a function that does nothing", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		for (const [name, fn] of Object.entries({
			preloadVideo,
			preloadAudio,
			preloadImage,
			preloadFont,
		})) {
			const free = fn("https://example.com/a");
			expect(typeof free).toBe("function");
			expect(free()).toBeUndefined();
			expect(String(warn.mock.calls.at(-1)?.[0])).toMatch(new RegExp(`^${name}\\(\\)`));
		}
		expect(warn).toHaveBeenCalledTimes(4);
		warn.mockRestore();
	});

	it("resolveRedirect() follows redirects and resolves for any status", async () => {
		expect(await resolveRedirect(`${origin}/hop`)).toBe(`${origin}/final`);
		expect(await resolveRedirect(`${origin}/missing`)).toBe(`${origin}/missing`);
		await expect(resolveRedirect("http://127.0.0.1:1/x")).rejects.toBeInstanceOf(TypeError);
	});
});
