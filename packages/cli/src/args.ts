import { parseArgs } from "node:util";
import { usageError } from "./errors.js";

// Arguments are parsed with node:util parseArgs: no dependency, maintained with Node, strict
// about unknown flags (a typo fails instead of being ignored), and it keeps every value a
// string so validation stays here. A small pre-pass adds what Remotion's CLI accepts and
// parseArgs does not: `--flag=false` / `--flag=true` and `--no-flag` for boolean flags.

export interface FlagSpec {
	type: "string" | "boolean";
	short?: string;
	/** One line for `--help`. */
	description: string;
}

export type FlagSpecs = Record<string, FlagSpec>;

export interface ParsedArgs {
	positionals: string[];
	values: Record<string, string | boolean | undefined>;
}

/** Parses `argv` against `specs`; unknown flags and missing values throw `E_INVALID_ARGUMENT`. */
export function parseCommandArgs(argv: readonly string[], specs: FlagSpecs): ParsedArgs {
	const negated = new Set<string>();
	const tokens: string[] = [];
	for (const token of argv) {
		const match = /^--(no-)?([a-z0-9-]+)(?:=(true|false))?$/.exec(token);
		const name = match?.[2];
		if (match && name && specs[name]?.type === "boolean" && (match[1] || match[3])) {
			const off = (match[1] !== undefined) !== (match[3] === "false");
			if (off) negated.add(name);
			else tokens.push(`--${name}`);
			continue;
		}
		tokens.push(token);
	}
	let parsed: ReturnType<typeof parseArgs>;
	try {
		parsed = parseArgs({
			args: tokens,
			options: Object.fromEntries(
				Object.entries(specs).map(([name, spec]) => [
					name,
					spec.short ? { type: spec.type, short: spec.short } : { type: spec.type },
				]),
			),
			allowPositionals: true,
			strict: true,
		});
	} catch (error) {
		throw usageError(error instanceof Error ? error.message : String(error));
	}
	const values = parsed.values as Record<string, string | boolean | undefined>;
	for (const name of negated) values[name] = false;
	return { positionals: parsed.positionals, values };
}

/** Typed, validated access to parsed flag values. */
export class Flags {
	constructor(private readonly values: Record<string, string | boolean | undefined>) {}

	has(name: string): boolean {
		return this.values[name] !== undefined;
	}

	string(name: string): string | undefined {
		const value = this.values[name];
		return typeof value === "string" ? value : undefined;
	}

	boolean(name: string): boolean | undefined {
		const value = this.values[name];
		return typeof value === "boolean" ? value : undefined;
	}

	oneOf<T extends string>(name: string, allowed: readonly T[]): T | undefined {
		const value = this.string(name);
		if (value === undefined) return undefined;
		if (!(allowed as readonly string[]).includes(value)) {
			throw usageError(`--${name} must be one of ${allowed.join(", ")}; got "${value}".`, {
				flag: name,
				value,
			});
		}
		return value as T;
	}

	integer(name: string, { min, max }: { min?: number; max?: number } = {}): number | undefined {
		const value = this.string(name);
		if (value === undefined) return undefined;
		const number = Number(value);
		if (
			!/^-?\d+$/.test(value) ||
			(min !== undefined && number < min) ||
			(max !== undefined && number > max)
		) {
			const range =
				min !== undefined && max !== undefined
					? ` from ${min} to ${max}`
					: min !== undefined
						? ` of at least ${min}`
						: "";
			throw usageError(`--${name} must be an integer${range}; got "${value}".`, {
				flag: name,
				value,
			});
		}
		return number;
	}

	number(name: string, check: (n: number) => boolean, expected: string): number | undefined {
		const value = this.string(name);
		if (value === undefined) return undefined;
		const number = Number(value);
		if (value.trim() === "" || !Number.isFinite(number) || !check(number)) {
			throw usageError(`--${name} must be ${expected}; got "${value}".`, { flag: name, value });
		}
		return number;
	}
}
