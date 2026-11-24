/**
 * CLI reference pages, generated at build time from `@motiojs/cli` itself: the command table that
 * `motio --help` and `motio <command> --help` print (`COMMANDS`), the exit codes (`EXIT`) and the
 * JSON schemas the CLI publishes in `schemas/`. Nothing here is written by hand per command.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type * as Cli from "@motiojs/cli";

export const CLI_PAGE_PREFIX = "reference/cli";

const require = createRequire(import.meta.url);
// Loaded by Node itself (require of an ES module) rather than through Vite, whose module runner
// would transform the whole CLI (bundler, renderer) to build pages of text.
const cli = require("@motiojs/cli") as typeof Cli;
const { COMMANDS, EXIT } = cli;
const SCHEMA_DIR = dirname(require.resolve("@motiojs/cli/schemas/common.schema.json"));

type Schema = {
	title?: string;
	description?: string;
	type?: string | string[];
	const?: unknown;
	enum?: unknown[];
	$ref?: string;
	oneOf?: Schema[];
	anyOf?: Schema[];
	properties?: Record<string, Schema>;
	required?: string[];
	items?: Schema;
	$defs?: Record<string, Schema>;
	pattern?: string;
};

const readSchema = (name: string): Schema | undefined => {
	const file = join(SCHEMA_DIR, `${name}.schema.json`);
	return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Schema) : undefined;
};

const COMMON = readSchema("common");

/** Name in JSON results and in the page title: `check determinism`. */
const commandName = (words: readonly string[]) => words.join(" ");
/** Route segment and schema name: `check-determinism`. */
const commandSlug = (words: readonly string[]) => words.join("-");

/** Table cells cannot hold a raw pipe. */
const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");

const commonDef = (ref: string) => {
	const name = /#\/\$defs\/(.+)$/.exec(ref)?.[1];
	return name ? { name, schema: COMMON?.$defs?.[name] } : undefined;
};

/** Shared definitions that have their own section on the overview page. */
const SECTIONS = new Set(["error", "composition"]);

const typeOf = (s: Schema): string => {
	if (s.$ref) {
		const def = commonDef(s.$ref);
		if (def && SECTIONS.has(def.name)) return `[${def.name}](/${CLI_PAGE_PREFIX}/#${def.name})`;
		return def?.schema ? typeOf(def.schema) : "object";
	}
	if (s.const !== undefined) return `\`${JSON.stringify(s.const)}\``;
	if (s.enum) return s.enum.map((v) => `\`${JSON.stringify(v)}\``).join(", ");
	const alternatives = s.oneOf ?? s.anyOf;
	if (alternatives) return alternatives.map(typeOf).join(" or ");
	if (s.type === "array" && s.items) return `array of ${typeOf(s.items)}`;
	if (Array.isArray(s.type)) return s.type.join(" or ");
	return s.type ?? "any";
};

type Row = { name: string; type: string; required: boolean; description: string };

/** Fields of an object schema, nested objects and arrays of objects flattened one level down. */
const fieldRows = (schema: Schema, prefix = "", depth = 0): Row[] =>
	Object.entries(schema.properties ?? {}).flatMap(([key, value]) => {
		const name = `${prefix}${key}`;
		const row: Row = {
			name,
			type: typeOf(value),
			required: schema.required?.includes(key) ?? false,
			description: value.description ?? "",
		};
		if (depth >= 2) return [row];
		if (value.properties) return [row, ...fieldRows(value, `${name}.`, depth + 1)];
		if (value.items?.properties) return [row, ...fieldRows(value.items, `${name}[].`, depth + 1)];
		return [row];
	});

const fieldsTable = (rows: Row[]) =>
	[
		"| Field | Type | Description |",
		"|---|---|---|",
		...rows.map(
			(r) =>
				`| \`${r.name}\`${r.required ? "" : " (optional)"} | ${cell(r.type)} | ${cell(r.description)} |`,
		),
	].join("\n");

const success = (schema: Schema) =>
	(schema.oneOf ?? [schema]).find((branch) => !branch.$ref && branch.properties);

type FlagSpec = { type: "string" | "boolean"; short?: string; description: string };

const flagsTable = (flags: Record<string, FlagSpec>) =>
	[
		"| Flag | Description |",
		"|---|---|",
		...Object.entries(flags).map(([name, spec]) => {
			const label = `\`--${name}${spec.type === "string" ? "=<value>" : ""}\`${spec.short ? `, \`-${spec.short}\`` : ""}`;
			return `| ${label} | ${cell(spec.description)} |`;
		}),
	].join("\n");

export type CliPage = { slug: string; title: string; description: string; markdown: string };

const EXIT_MEANING: Record<keyof typeof EXIT, string> = {
	ok: "Success.",
	error: "The command failed: a render error, a missing composition, a browser or FFmpeg problem.",
	usage: "Invalid arguments or flags (`E_INVALID_ARGUMENT`).",
	checkFailed: "A check ran and found problems: determinism, flicker or doctor.",
};

const commandPage = (definition: (typeof COMMANDS)[number]): CliPage => {
	const name = commandName(definition.words);
	const slug = commandSlug(definition.words);
	const schema = readSchema(slug);
	const ok = schema ? success(schema) : undefined;
	const parts = [
		`${definition.summary}`,
		"```bash",
		definition.usage,
		"```",
		"## Flags",
		flagsTable(definition.flags as Record<string, FlagSpec>),
	];
	if (ok) {
		parts.push(
			"## JSON output",
			`With \`--json\`, \`motio ${name}\` prints exactly one JSON object on stdout. On success it has these fields; on failure it is the [error object](/${CLI_PAGE_PREFIX}/#error). The schema ships with the CLI as \`@motiojs/cli/schemas/${slug}.schema.json\`.`,
			fieldsTable(fieldRows(ok)),
		);
	}
	parts.push(
		"## Exit codes",
		`See [exit codes](/${CLI_PAGE_PREFIX}/#exit-codes). Run \`motio ${name} --help\` for the same list of flags in the terminal.`,
	);
	return {
		slug: `${CLI_PAGE_PREFIX}/${slug}`,
		title: `motio ${name}`,
		description: definition.summary,
		markdown: parts.join("\n\n"),
	};
};

const overviewPage = (): CliPage => {
	const error = COMMON?.$defs?.error;
	const composition = COMMON?.$defs?.composition;
	const base = COMMANDS[0]?.flags as Record<string, FlagSpec> | undefined;
	const shared = Object.fromEntries(
		Object.entries(base ?? {}).filter(([name]) => COMMANDS.every((c) => name in c.flags)),
	);
	const parts = [
		"The `motio` command comes with `@motiojs/cli`. These pages are generated from the CLI itself: the same table that prints `--help`, and the JSON schemas it publishes.",
		"## Commands",
		[
			"| Command | What it does |",
			"|---|---|",
			...COMMANDS.map(
				(c) =>
					`| [\`motio ${commandName(c.words)}\`](/${CLI_PAGE_PREFIX}/${commandSlug(c.words)}/) | ${cell(c.summary)} |`,
			),
		].join("\n"),
		"## Flags of every command",
		flagsTable(shared),
		"## Exit codes",
		[
			"| Code | Meaning |",
			"|---|---|",
			...Object.entries(EXIT).map(
				([key, code]) => `| \`${code}\` | ${EXIT_MEANING[key as keyof typeof EXIT]} |`,
			),
		].join("\n"),
	];
	if (error) {
		parts.push(
			"## Error",
			"A failed command with `--json` prints one object with `ok: false`. Error codes are stable across releases: match on `code`, not on `message`.",
			fieldsTable(fieldRows(error)),
		);
	}
	if (composition) {
		parts.push(
			"## Composition",
			"Commands that render report the composition they rendered with this object.",
			fieldsTable(fieldRows(composition)),
		);
	}
	return {
		slug: CLI_PAGE_PREFIX,
		title: "CLI",
		description: "Every motio command, its flags, its JSON output and the exit codes.",
		markdown: parts.join("\n\n"),
	};
};

/** The overview page, then one page per command in help order. */
export const cliPages = (): CliPage[] => [overviewPage(), ...COMMANDS.map(commandPage)];

/** Sidebar items of the CLI reference, in help order. */
export const cliSidebar = () => [
	{ label: "Overview", slug: CLI_PAGE_PREFIX },
	...COMMANDS.map((c) => ({
		label: commandName(c.words),
		slug: `${CLI_PAGE_PREFIX}/${commandSlug(c.words)}`,
	})),
];
