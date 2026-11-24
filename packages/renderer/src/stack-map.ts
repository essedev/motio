import { readFile } from "node:fs/promises";
import { SourceMap, type SourceMapPayload } from "node:module";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { SourceLocation } from "./errors.js";

/** A stack trace from the page with its frames mapped to the project's sources. */
export interface MappedStack {
	/** The stack with every frame that has a source map rewritten to its source position. */
	stack: string;
	/** The first frame in the project's own code (not in `node_modules`), if any. */
	source: SourceLocation | null;
}

/** A stack frame position: `url:line:column` at the end of a V8 stack line. */
const FRAME = /^(\s*at\s+(?:.*?\()?)(.+?):(\d+):(\d+)(\)?\s*)$/;

interface LoadedMap {
	map: SourceMap;
	/** Directory the map's relative `sources` resolve against, or a base URL. */
	base: { dir: string } | { url: string };
}

/**
 * Maps stack traces from the render page back to the project's sources, through the source maps
 * the bundler writes next to each chunk (`assets/main-<hash>.js.map`). Frames are read from
 * `serverUrl` (the local server of a bundle directory, or the http(s) `serveUrl`); maps are read
 * from `bundleDir` when the bundle is local, else fetched. Each map is loaded once.
 */
export class StackMapper {
	private readonly maps = new Map<string, Promise<LoadedMap | null>>();

	private readonly serverUrl: string;

	constructor(
		serverUrl: string,
		private readonly bundleDir: string | null,
	) {
		// A serveUrl naming a page (`https://host/bundle/index.html`) serves chunks next to it.
		this.serverUrl = new URL(".", serverUrl).href;
	}

	/** Maps `stack`; frames without a map are kept as they are. */
	async map(stack: string): Promise<MappedStack> {
		const lines = stack.split("\n");
		let source: SourceLocation | null = null;
		const out: string[] = [];
		for (const line of lines) {
			const m = FRAME.exec(line);
			if (!m) {
				out.push(line);
				continue;
			}
			const [, before, url, lineText, columnText, after] = m as unknown as [
				string,
				string,
				string,
				string,
				string,
				string,
			];
			const mapped = await this.position(url, Number(lineText), Number(columnText));
			if (!mapped) {
				out.push(line);
				continue;
			}
			out.push(`${before}${mapped.file}:${mapped.line}:${mapped.column}${after}`);
			if (!source && isProjectFile(mapped.file)) source = mapped;
		}
		return { stack: out.join("\n"), source };
	}

	/** The source position of a 1-based generated position, or null when it has no mapping. */
	async position(url: string, line: number, column: number): Promise<SourceLocation | null> {
		const loaded = await this.load(url);
		if (!loaded) return null;
		const entry = loaded.map.findEntry(line - 1, column - 1) as Partial<{
			originalSource: string;
			originalLine: number;
			originalColumn: number;
		}>;
		if (entry.originalSource === undefined || entry.originalLine === undefined) return null;
		return {
			file: resolveSource(entry.originalSource, loaded.base),
			line: entry.originalLine + 1,
			column: (entry.originalColumn ?? 0) + 1,
		};
	}

	private load(url: string): Promise<LoadedMap | null> {
		const key = url.split(/[?#]/)[0] ?? url;
		let pending = this.maps.get(key);
		if (!pending) {
			pending = this.read(key);
			this.maps.set(key, pending);
		}
		return pending;
	}

	/**
	 * Reads the map of a chunk. A chunk outside the bundle, or without a map (a bundle built
	 * without source maps), has none: its frames stay as they are.
	 */
	private async read(url: string): Promise<LoadedMap | null> {
		if (!url.startsWith(this.serverUrl)) return null;
		const rel = decodeURIComponent(url.slice(this.serverUrl.length).replace(/^\/+/, ""));
		if (!rel.endsWith(".js") && !rel.endsWith(".mjs")) return null;
		let text: string;
		let base: LoadedMap["base"];
		if (this.bundleDir !== null) {
			const root = resolve(this.bundleDir);
			const file = resolve(root, `${rel}.map`);
			if (file !== root && !file.startsWith(root + sep)) return null;
			const read = await readFile(file, "utf8").then(
				(t) => t,
				(err: NodeJS.ErrnoException) => {
					if (err.code === "ENOENT") return null;
					throw err;
				},
			);
			if (read === null) return null;
			text = read;
			base = { dir: dirname(file) };
		} else {
			const res = await fetch(`${url}.map`);
			if (!res.ok) return null;
			text = await res.text();
			base = { url };
		}
		const payload = JSON.parse(text) as SourceMapPayload & { sourceRoot?: string };
		return { map: new SourceMap(payload), base };
	}
}

/** Resolves a map's `sources` entry to an absolute path (local bundle) or URL. */
function resolveSource(source: string, base: LoadedMap["base"]): string {
	if (source.startsWith("file://")) return fileURLToPath(source);
	if (/^[a-z][a-z0-9+.-]*:/i.test(source)) return source;
	if ("dir" in base) return isAbsolute(source) ? source : join(base.dir, source);
	return new URL(source, base.url).href;
}

/** True for a source in the project's code rather than a dependency or a generated module. */
function isProjectFile(file: string): boolean {
	return !/[\\/]node_modules[\\/]/.test(file) && !file.includes("\0") && !/^virtual:/.test(file);
}
