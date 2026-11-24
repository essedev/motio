import type { SchemaLike } from "@motiojs/core/internals";

/** One problem with the edited props: a JSON syntax error, a schema issue or an unknown key. */
export interface PropsIssue {
	/** Dotted path of the field, empty for the whole object or a syntax error. */
	path: string;
	message: string;
}

/** The result of reading the props editor. */
export type PropsParseResult =
	| { ok: true; props: Record<string, unknown>; issues: PropsIssue[] }
	| { ok: false; issues: PropsIssue[] };

/**
 * Parses the props editor text. Invalid JSON or a value that is not an object fails. A schema
 * mismatch does not fail, as in a render (Remotion 4 warns and renders anyway), but its
 * issues are returned so the page can show them, with the keys that are neither in
 * `defaultProps` nor in the schema (a typo is otherwise merged in silently).
 */
export function parseProps(
	text: string,
	schema: SchemaLike | null,
	defaultProps: Record<string, unknown> = {},
): PropsParseResult {
	let value: unknown;
	try {
		value = text.trim() === "" ? {} : JSON.parse(text);
	} catch (error) {
		return {
			ok: false,
			issues: [{ path: "", message: error instanceof Error ? error.message : String(error) }],
		};
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return { ok: false, issues: [{ path: "", message: "The props must be a JSON object." }] };
	}
	const props = value as Record<string, unknown>;
	return {
		ok: true,
		props,
		issues: [
			...unknownKeyIssues(props, defaultProps, schema),
			...(schema ? schemaIssues(schema, props) : []),
		],
	};
}

/**
 * Issues for the keys of `props` that neither `defaultProps` nor the schema's object shape
 * declares, with the closest known key as a suggestion. Nothing is reported when there is
 * nothing to compare with (no default props and no readable shape) or when the schema accepts
 * any key (`passthrough()`, `catchall()`).
 */
export function unknownKeyIssues(
	props: Record<string, unknown>,
	defaultProps: Record<string, unknown>,
	schema: SchemaLike | null,
): PropsIssue[] {
	const shape = schema ? schemaKeys(schema) : null;
	if (shape === "any") return [];
	const known = new Set([...Object.keys(defaultProps), ...(shape ?? [])]);
	if (known.size === 0 && shape === null) return [];
	const issues: PropsIssue[] = [];
	for (const key of Object.keys(props)) {
		if (known.has(key)) continue;
		const near = closest(key, [...known]);
		issues.push({
			path: key,
			message: `Unknown prop: not in defaultProps${shape ? " or the schema" : ""}.${near ? ` Did you mean "${near}"?` : ""}`,
		});
	}
	return issues;
}

/** Loose view of a Zod schema (v3 `_def`, v4 `_zod.def`), read without depending on Zod. */
interface SchemaInternals {
	shape?: unknown;
	_def?: {
		shape?: unknown;
		schema?: unknown;
		innerType?: unknown;
		unknownKeys?: unknown;
		catchall?: unknown;
		in?: unknown;
	};
	_zod?: { def?: { shape?: unknown; catchall?: unknown; innerType?: unknown; in?: unknown } };
}

/**
 * The keys of a schema's object shape, `"any"` when it accepts unknown keys, or null when the
 * schema is not an object schema this code can read. Follows refinements, defaults and
 * optional wrappers.
 */
export function schemaKeys(schema: unknown, depth = 0): string[] | "any" | null {
	if (depth > 8 || typeof schema !== "object" || schema === null) return null;
	const s = schema as SchemaInternals;
	const def = s._def;
	const v4 = s._zod?.def;
	const rawShape = s.shape ?? v4?.shape ?? def?.shape;
	const shape = typeof rawShape === "function" ? (rawShape as () => unknown)() : rawShape;
	if (typeof shape === "object" && shape !== null) {
		if (def?.unknownKeys === "passthrough") return "any";
		const catchall = v4?.catchall ?? def?.catchall;
		if (catchall && !isNever(catchall)) return "any";
		return Object.keys(shape);
	}
	const inner = def?.schema ?? def?.innerType ?? def?.in ?? v4?.innerType ?? v4?.in;
	return inner ? schemaKeys(inner, depth + 1) : null;
}

function isNever(schema: unknown): boolean {
	const s = schema as { _def?: { typeName?: unknown }; _zod?: { def?: { type?: unknown } } };
	return s._def?.typeName === "ZodNever" || s._zod?.def?.type === "never";
}

/** The candidate closest to `word` by edit distance, if close enough to be a likely typo. */
export function closest(word: string, candidates: readonly string[]): string | null {
	let best: string | null = null;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const candidate of candidates) {
		const distance = editDistance(word.toLowerCase(), candidate.toLowerCase());
		if (distance < bestDistance) {
			best = candidate;
			bestDistance = distance;
		}
	}
	const limit = Math.max(1, Math.floor(word.length / 3));
	return best !== null && bestDistance <= limit ? best : null;
}

/** Levenshtein distance with adjacent transpositions counted as one edit. */
function editDistance(a: string, b: string): number {
	const rows = a.length + 1;
	const cols = b.length + 1;
	const d: number[][] = Array.from({ length: rows }, (_, i) =>
		Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
	);
	for (let i = 1; i < rows; i++) {
		const row = d[i] as number[];
		const above = d[i - 1] as number[];
		for (let j = 1; j < cols; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			let value = Math.min(
				(above[j] as number) + 1,
				(row[j - 1] as number) + 1,
				(above[j - 1] as number) + cost,
			);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				value = Math.min(value, ((d[i - 2] as number[])[j - 2] as number) + 1);
			}
			row[j] = value;
		}
	}
	return (d[a.length] as number[])[b.length] as number;
}

/** Checks props against a Zod-like schema and lists its issues. */
export function schemaIssues(schema: SchemaLike, props: Record<string, unknown>): PropsIssue[] {
	let parsed: ReturnType<SchemaLike["safeParse"]>;
	try {
		parsed = schema.safeParse(props);
	} catch (error) {
		return [
			{
				path: "",
				message: `The schema threw: ${error instanceof Error ? error.message : String(error)}`,
			},
		];
	}
	if (parsed.success) return [];
	const issues = parsed.error?.issues ?? [];
	if (issues.length === 0) return [{ path: "", message: "The props do not match the schema." }];
	return issues.map((issue) => ({
		path: issue.path.map(String).join("."),
		message: issue.message,
	}));
}

/** Pretty-prints props for the editor. */
export function formatProps(props: Record<string, unknown>): string {
	return JSON.stringify(props, null, 2);
}
