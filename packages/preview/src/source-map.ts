/** A source map (version 3) as Vite serves it, inline in each transformed module. */
export interface RawSourceMap {
	version?: number;
	sources: string[];
	sourcesContent?: Array<string | null>;
	names?: string[];
	mappings: string;
	sourceRoot?: string;
}

/** Where a generated position comes from. Lines and columns are 1-based. */
export interface OriginalPosition {
	source: string;
	line: number;
	column: number;
	/** The source text, when the map embeds it. */
	content: string | null;
}

/** One decoded mapping segment: generated column, source index, original line and column. */
type Segment = [number, number, number, number];

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const DIGIT = new Map([...BASE64].map((c, i) => [c, i]));

/** Decodes the Base64 VLQ `mappings` of a source map into segments per generated line. */
export function decodeMappings(mappings: string): Segment[][] {
	const lines: Segment[][] = [];
	let source = 0;
	let line = 0;
	let column = 0;
	for (const lineText of mappings.split(";")) {
		const segments: Segment[] = [];
		let generated = 0;
		for (const text of lineText.split(",")) {
			if (text === "") continue;
			const fields = decodeVlq(text);
			generated += fields[0] ?? 0;
			if (fields.length >= 4) {
				source += fields[1] ?? 0;
				line += fields[2] ?? 0;
				column += fields[3] ?? 0;
				segments.push([generated, source, line, column]);
			}
		}
		segments.sort((a, b) => a[0] - b[0]);
		lines.push(segments);
	}
	return lines;
}

function decodeVlq(text: string): number[] {
	const values: number[] = [];
	let value = 0;
	let shift = 0;
	for (const char of text) {
		const digit = DIGIT.get(char);
		if (digit === undefined) throw new Error(`Invalid character "${char}" in source map mappings`);
		value += (digit & 31) * 2 ** shift;
		if (digit & 32) {
			shift += 5;
			continue;
		}
		const negative = value % 2 === 1;
		const magnitude = Math.floor(value / 2);
		values.push(negative ? -magnitude : magnitude);
		value = 0;
		shift = 0;
	}
	return values;
}

/** A parsed source map that answers original positions. */
export class SourceMapLookup {
	private readonly lines: Segment[][];

	constructor(private readonly map: RawSourceMap) {
		this.lines = decodeMappings(map.mappings);
	}

	/** The original position of a generated 1-based line and column, or null if unmapped. */
	originalPosition(line: number, column: number): OriginalPosition | null {
		const segments = this.lines[line - 1];
		if (!segments || segments.length === 0) return null;
		// The last segment that starts at or before the column.
		let low = 0;
		let high = segments.length - 1;
		let found = -1;
		while (low <= high) {
			const mid = (low + high) >> 1;
			if ((segments[mid] as Segment)[0] <= column - 1) {
				found = mid;
				low = mid + 1;
			} else high = mid - 1;
		}
		const segment = segments[found === -1 ? 0 : found] as Segment;
		const source = this.map.sources[segment[1]];
		if (source === undefined) return null;
		return {
			source: (this.map.sourceRoot ?? "") + source,
			line: segment[2] + 1,
			column: segment[3] + 1,
			content: this.map.sourcesContent?.[segment[1]] ?? null,
		};
	}
}

/**
 * The source map a module's code points to with `//# sourceMappingURL=`, inline (`data:`) or
 * as a URL resolved against the module's. Null when the module has none.
 */
export async function loadSourceMap(
	code: string,
	moduleUrl: string,
	fetchText: (url: string) => Promise<string>,
): Promise<RawSourceMap | null> {
	const match = /\/\/[#@] sourceMappingURL=(\S+)\s*$/.exec(code.trimEnd());
	if (!match?.[1]) return null;
	const reference = match[1];
	let text: string;
	const inline = /^data:application\/json[^,]*?(;base64)?,(.*)$/.exec(reference);
	if (inline) {
		const payload = inline[2] ?? "";
		text = inline[1] ? decodeBase64Utf8(payload) : decodeURIComponent(payload);
	} else {
		text = await fetchText(new URL(reference, moduleUrl).href);
	}
	const parsed = JSON.parse(text) as RawSourceMap;
	if (typeof parsed.mappings !== "string" || !Array.isArray(parsed.sources)) return null;
	return parsed;
}

function decodeBase64Utf8(base64: string): string {
	const binary = atob(base64);
	const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}
