import { loadSourceMap, SourceMapLookup } from "./source-map.js";

/** One line of a stack trace, mapped to the original source when possible. */
export interface StackFrame {
	/** Function name, or null for anonymous code. */
	fn: string | null;
	/** File to show: `src/Root.tsx` for project files, else the URL path. */
	file: string;
	line: number;
	column: number;
	/** React, Motio, Vite and other dependency code, folded away by default. */
	internal: boolean;
	/** The original source around `line`, for the first project frame. */
	context: SourceContext | null;
}

/** Lines of source around a location. */
export interface SourceContext {
	/** First line number of `lines`. */
	start: number;
	lines: string[];
	/** The line the frame points at. */
	line: number;
	column: number;
}

const FRAME = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/;
const CONTEXT_LINES = 2;

/** Parses the frames of a V8 stack trace (`at fn (url:line:column)`). */
export function parseStack(
	stack: string,
): Array<{ fn: string | null; url: string; line: number; column: number }> {
	const frames: Array<{ fn: string | null; url: string; line: number; column: number }> = [];
	for (const text of stack.split("\n")) {
		const match = FRAME.exec(text);
		if (!match) continue;
		const fn = match[1]?.replace(/^async /, "") ?? null;
		frames.push({ fn, url: match[2] as string, line: Number(match[3]), column: Number(match[4]) });
	}
	return frames;
}

/**
 * Code the user did not write: dependencies (`node_modules`, Vite's pre-bundled `.vite/deps`),
 * Vite's own modules, and built packages served from outside the project (`/@fs/.../dist/`),
 * which is where Motio's packages come from in a workspace.
 */
export function isInternalUrl(url: string): boolean {
	let path: string;
	try {
		path = new URL(url, "http://motio.invalid").pathname;
	} catch {
		return true;
	}
	return (
		/\/node_modules\/|\/\.vite\//.test(path) ||
		/^\/@(vite|id|react-refresh)/.test(path) ||
		(path.startsWith("/@fs/") && path.includes("/dist/")) ||
		!/^(https?:|\/)/.test(url)
	);
}

/** The file name to show for a module URL: project-relative for files the dev server roots. */
export function displayFile(url: string): string {
	try {
		const parsed = new URL(url, "http://motio.invalid");
		const path = decodeURIComponent(parsed.pathname);
		return path.startsWith("/@fs/") ? path.slice(4) : path.replace(/^\//, "");
	} catch {
		return url;
	}
}

/** Fetches a module's text; the default uses `fetch` with the page's origin. */
export type FetchText = (url: string) => Promise<string>;

const defaultFetch: FetchText = async (url) => {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
	return response.text();
};

/**
 * Maps a stack trace through the dev server's source maps: the line numbers of the
 * transformed modules become those of the files the user edits, and dependency frames are
 * marked internal. Modules are fetched once per call; a module without a usable map keeps its
 * generated position.
 */
export async function mapStack(
	stack: string,
	fetchText: FetchText = defaultFetch,
): Promise<StackFrame[]> {
	const lookups = new Map<string, Promise<SourceMapLookup | null>>();
	const lookupFor = (url: string) => {
		const key = url.split("#")[0] as string;
		let pending = lookups.get(key);
		if (!pending) {
			pending = fetchText(key)
				.then((code) => loadSourceMap(code, key, fetchText))
				.then((map) => (map ? new SourceMapLookup(map) : null))
				.catch(() => null);
			lookups.set(key, pending);
		}
		return pending;
	};
	let contextGiven = false;
	const frames: StackFrame[] = [];
	for (const raw of parseStack(stack)) {
		const internal = isInternalUrl(raw.url);
		let line = raw.line;
		let column = raw.column;
		let content: string | null = null;
		if (!internal) {
			const position = (await lookupFor(raw.url))?.originalPosition(raw.line, raw.column);
			if (position) {
				line = position.line;
				column = position.column;
				content = position.content;
			}
		}
		let context: SourceContext | null = null;
		if (!internal && !contextGiven && content !== null) {
			context = sourceContext(content, line, column);
			contextGiven = context !== null;
		}
		frames.push({ fn: raw.fn, file: displayFile(raw.url), line, column, internal, context });
	}
	return frames;
}

/** The lines around `line` in `content`. */
export function sourceContext(content: string, line: number, column: number): SourceContext | null {
	const lines = content.split(/\r?\n/);
	if (line < 1 || line > lines.length) return null;
	const start = Math.max(1, line - CONTEXT_LINES);
	const end = Math.min(lines.length, line + CONTEXT_LINES);
	return { start, lines: lines.slice(start - 1, end), line, column };
}

/** The first line of a stack: `Error: message`, without the frames. */
export function stackHeadline(error: { name?: string; message?: string }): string {
	const name = error.name && error.name !== "Error" ? `${error.name}: ` : "";
	return `${name}${error.message ?? String(error)}`;
}
