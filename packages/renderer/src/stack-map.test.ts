import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MotioError } from "./errors.js";
import { mapErrorStack } from "./render-page.js";
import { StackMapper } from "./stack-map.js";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 VLQ of one source map field. */
function vlq(value: number): string {
	let v = value < 0 ? (-value << 1) | 1 : value << 1;
	let out = "";
	do {
		let digit = v & 31;
		v >>>= 5;
		if (v > 0) digit |= 32;
		out += B64[digit];
	} while (v > 0);
	return out;
}

/**
 * A map for a two-line chunk: line 1 column 1 comes from node_modules/react-dom (line 10), line 2
 * column 21 from src/Root.tsx line 30, column 11. Fields are relative, as the format wants.
 */
const MAP = {
	version: 3,
	file: "main.js",
	sources: ["../../node_modules/react-dom/index.js", "../../src/Root.tsx"],
	names: [],
	mappings: `${vlq(0)}${vlq(0)}${vlq(9)}${vlq(0)};${vlq(20)}${vlq(1)}${vlq(20)}${vlq(10)}`,
};

let dir: string;

beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), "motio-stack-"));
	await mkdir(join(dir, "bundle", "assets"), { recursive: true });
	await writeFile(join(dir, "bundle", "assets", "main.js.map"), JSON.stringify(MAP));
});

afterAll(async () => {
	await rm(dir, { recursive: true, force: true });
});

const SERVER = "http://127.0.0.1:4100";
const STACK = [
	"Error: Boom at frame ten",
	`    at Throws (${SERVER}/assets/main.js:2:21)`,
	`    at renderWithHooks (${SERVER}/assets/main.js:1:1)`,
	`    at ${SERVER}/assets/other.js:5:5`,
].join("\n");

describe("StackMapper", () => {
	it("maps frames to the project's sources and picks the first frame in its own code", async () => {
		const mapper = new StackMapper(SERVER, join(dir, "bundle"));
		const mapped = await mapper.map(STACK);
		const root = join(dir, "src", "Root.tsx");
		expect(mapped.source).toEqual({ file: root, line: 30, column: 11 });
		expect(mapped.stack.split("\n")).toEqual([
			"Error: Boom at frame ten",
			`    at Throws (${root}:30:11)`,
			`    at renderWithHooks (${join(dir, "node_modules", "react-dom", "index.js")}:10:1)`,
			// No map for this chunk: the frame stays as it was.
			`    at ${SERVER}/assets/other.js:5:5`,
		]);
	});

	it("puts the mapped stack and the source on the error, keeping the raw stack", async () => {
		const mapper = new StackMapper(SERVER, join(dir, "bundle"));
		const err = new MotioError("E_RENDER_ERROR", "Boom at frame ten", {
			frame: 10,
			composition: "Throws",
			pageStack: STACK,
		});
		const out = await mapErrorStack(err, mapper);
		expect(out.code).toBe("E_RENDER_ERROR");
		expect(out.message).toBe("Boom at frame ten");
		expect(out.pageStack).toContain(`${join(dir, "src", "Root.tsx")}:30:11`);
		expect(out.details).toEqual({
			frame: 10,
			compositionId: "Throws",
			rawStack: STACK,
			source: { file: join(dir, "src", "Root.tsx"), line: 30, column: 11 },
		});
	});

	it("reports an unreadable map in the details instead of hiding the error", async () => {
		await writeFile(join(dir, "bundle", "assets", "broken.js.map"), "{ not json");
		const mapper = new StackMapper(SERVER, join(dir, "bundle"));
		const err = new MotioError("E_RENDER_ERROR", "x", {
			pageStack: `Error: x\n    at ${SERVER}/assets/broken.js:1:1`,
		});
		const out = await mapErrorStack(err, mapper);
		expect(out.details?.sourceMapError).toEqual(expect.any(String));
		expect(out.pageStack).toBe(err.pageStack);
	});
});
