import { describe, expect, it } from "vitest";
import { decodeMappings, loadSourceMap, SourceMapLookup } from "./source-map.js";
import { displayFile, isInternalUrl, mapStack, parseStack, sourceContext } from "./stack.js";

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function vlq(value: number): string {
	let v = value < 0 ? (-value << 1) | 1 : value << 1;
	let out = "";
	do {
		let digit = v & 31;
		v >>>= 5;
		if (v > 0) digit |= 32;
		out += BASE64[digit];
	} while (v > 0);
	return out;
}

/** Mappings from absolute [generatedColumn, source, line, column] segments per generated line. */
function encode(lines: Array<Array<[number, number, number, number]>>): string {
	let source = 0;
	let line = 0;
	let column = 0;
	return lines
		.map((segments) => {
			let generated = 0;
			return segments
				.map(([g, s, l, c]) => {
					const text = vlq(g - generated) + vlq(s - source) + vlq(l - line) + vlq(c - column);
					generated = g;
					source = s;
					line = l;
					column = c;
					return text;
				})
				.join(",");
		})
		.join(";");
}

const ORIGINAL = [
	'import { AbsoluteFill } from "@motiojs/motio";',
	"",
	"export const Throws = () => {",
	"\tconst frame = useCurrentFrame();",
	'\tif (frame === 10) throw new Error("Boom at frame ten");',
	"\treturn <AbsoluteFill />;",
	"};",
].join("\n");

// Generated line 120 (a refresh preamble pushed the code down) maps to original line 5.
const lines: Array<Array<[number, number, number, number]>> = Array.from({ length: 130 }, () => []);
lines[119] = [
	[0, 0, 4, 0],
	[24, 0, 4, 20],
];
const map = {
	version: 3,
	sources: ["Root.tsx"],
	sourcesContent: [ORIGINAL],
	mappings: encode(lines),
};
const inline = `//# sourceMappingURL=data:application/json;base64,${btoa(JSON.stringify(map))}`;
const modules: Record<string, string> = {
	"http://localhost:3000/src/Root.tsx?t=1": `${"\n".repeat(130)}${inline}`,
};
const fetchText = async (url: string) => {
	const code = modules[url];
	if (code === undefined) throw new Error(`no ${url}`);
	return code;
};

describe("source maps", () => {
	it("decodes mappings and finds the segment at or before a column", () => {
		const decoded = decodeMappings(
			encode([
				[
					[0, 0, 0, 0],
					[5, 0, 2, 3],
				],
				[],
				[[2, 1, 7, 1]],
			]),
		);
		expect(decoded).toEqual([
			[
				[0, 0, 0, 0],
				[5, 0, 2, 3],
			],
			[],
			[[2, 1, 7, 1]],
		]);
		const lookup = new SourceMapLookup({
			sources: ["a.ts", "b.ts"],
			mappings: encode([
				[
					[0, 0, 0, 0],
					[5, 0, 2, 3],
				],
			]),
		});
		expect(lookup.originalPosition(1, 3)).toMatchObject({ source: "a.ts", line: 1, column: 1 });
		expect(lookup.originalPosition(1, 9)).toMatchObject({ source: "a.ts", line: 3, column: 4 });
		expect(lookup.originalPosition(5, 1)).toBeNull();
	});

	it("reads inline and external maps", async () => {
		expect(await loadSourceMap(`x;\n${inline}\n`, "http://h/a.js", fetchText)).toMatchObject({
			sources: ["Root.tsx"],
		});
		const external = await loadSourceMap(
			"x;\n//# sourceMappingURL=a.js.map",
			"http://h/dir/a.js",
			async (url) => {
				expect(url).toBe("http://h/dir/a.js.map");
				return JSON.stringify(map);
			},
		);
		expect(external?.sources).toEqual(["Root.tsx"]);
		expect(await loadSourceMap("x;", "http://h/a.js", fetchText)).toBeNull();
	});
});

describe("stacks", () => {
	const stack = [
		"Error: Boom at frame ten",
		"    at Throws (http://localhost:3000/src/Root.tsx?t=1:120:26)",
		"    at renderWithHooks (http://localhost:3000/node_modules/.vite/deps/react-dom_client.js?v=1:5:10)",
		"    at http://localhost:3000/@fs/work/motio/packages/core/dist/timeline/sequence.js:3:4",
		"    at async load (http://localhost:3000/src/data.ts:4:2)",
	].join("\n");

	it("parses V8 frames", () => {
		expect(parseStack(stack)).toEqual([
			{ fn: "Throws", url: "http://localhost:3000/src/Root.tsx?t=1", line: 120, column: 26 },
			{
				fn: "renderWithHooks",
				url: "http://localhost:3000/node_modules/.vite/deps/react-dom_client.js?v=1",
				line: 5,
				column: 10,
			},
			{
				fn: null,
				url: "http://localhost:3000/@fs/work/motio/packages/core/dist/timeline/sequence.js",
				line: 3,
				column: 4,
			},
			{ fn: "load", url: "http://localhost:3000/src/data.ts", line: 4, column: 2 },
		]);
	});

	it("tells project files from dependencies and shows project-relative names", () => {
		expect(isInternalUrl("http://localhost:3000/src/Root.tsx?t=1")).toBe(false);
		expect(isInternalUrl("http://localhost:3000/node_modules/.vite/deps/react-dom.js")).toBe(true);
		expect(isInternalUrl("http://localhost:3000/@fs/a/node_modules/x/index.js")).toBe(true);
		expect(isInternalUrl("http://localhost:3000/@fs/work/motio/packages/core/dist/x.js")).toBe(
			true,
		);
		expect(isInternalUrl("http://localhost:3000/@fs/work/shared/src/util.ts")).toBe(false);
		expect(isInternalUrl("native")).toBe(true);
		expect(displayFile("http://localhost:3000/src/My%20Comp.tsx?t=1")).toBe("src/My Comp.tsx");
		expect(displayFile("http://localhost:3000/@fs/work/shared/util.ts")).toBe(
			"/work/shared/util.ts",
		);
	});

	it("maps project frames to the edited file, with the source around the first one", async () => {
		const frames = await mapStack(stack, fetchText);
		expect(
			frames.map(({ fn, file, line, column, internal }) => ({ fn, file, line, column, internal })),
		).toEqual([
			{ fn: "Throws", file: "src/Root.tsx", line: 5, column: 21, internal: false },
			{
				fn: "renderWithHooks",
				file: "node_modules/.vite/deps/react-dom_client.js",
				line: 5,
				column: 10,
				internal: true,
			},
			{
				fn: null,
				file: "/work/motio/packages/core/dist/timeline/sequence.js",
				line: 3,
				column: 4,
				internal: true,
			},
			// No module to fetch: the generated position stays.
			{ fn: "load", file: "src/data.ts", line: 4, column: 2, internal: false },
		]);
		expect(frames[0]?.context).toEqual({
			start: 3,
			lines: ORIGINAL.split("\n").slice(2, 7),
			line: 5,
			column: 21,
		});
		expect(frames[3]?.context).toBeNull();
	});

	it("cuts the context at the file's edges", () => {
		expect(sourceContext("a\nb\nc", 1, 1)).toEqual({
			start: 1,
			lines: ["a", "b", "c"],
			line: 1,
			column: 1,
		});
		expect(sourceContext("a", 4, 1)).toBeNull();
	});
});
