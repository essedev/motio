import type { SchemaLike } from "@motiojs/core/internals";

/** One problem with the edited props: a JSON syntax error or a schema issue. */
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
 * issues are returned so the page can show them.
 */
export function parseProps(text: string, schema: SchemaLike | null): PropsParseResult {
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
	return { ok: true, props, issues: schema ? schemaIssues(schema, props) : [] };
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
