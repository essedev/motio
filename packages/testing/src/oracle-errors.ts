// Compares failures of Motio with failures recorded from the published Remotion package on
// behaviour, not on wording: the same calls throw, with the same built-in error class, and Motio's
// message names the same options. Messages are Motio's own (docs/DECISIONS.md, D-054).

/** A failure recorded by an oracle script: the thrown message and, when recorded, its class. */
export interface RecordedFailure {
	/** The recorded message. Used only to find which options it names. */
	readonly error: string;
	/** The built-in class the recorded error derives from (`"TypeError"`, `"Error"`, ...). */
	readonly errorType?: string | undefined;
}

const BUILT_IN_ERRORS = [
	TypeError,
	RangeError,
	SyntaxError,
	ReferenceError,
	EvalError,
	URIError,
] as const;

/**
 * The built-in error class `value` derives from: `"TypeError"`, `"RangeError"`, ..., `"Error"`
 * for any other `Error`, or `undefined` for a value that is not an error. Subclasses report their
 * built-in base, so `class Mine extends TypeError` is a `"TypeError"`.
 */
export function errorClassOf(value: unknown): string | undefined {
	for (const ctor of BUILT_IN_ERRORS) if (value instanceof ctor) return ctor.name;
	if (value instanceof Error) return "Error";
	// Errors from another realm (a DOMException, an error from a page) are matched by name.
	if (typeof value === "object" && value !== null && typeof (value as Error).name === "string") {
		const name = (value as Error).name;
		if (name === "Error" || BUILT_IN_ERRORS.some((c) => c.name === name)) return name;
	}
	return undefined;
}

/** Runs `call` and returns what it threw, or `undefined` with `threw: false` if it returned. */
export function failureOf(call: () => unknown): { threw: boolean; error: unknown } {
	try {
		call();
		return { threw: false, error: undefined };
	} catch (error) {
		return { threw: true, error };
	}
}

// Messages written by the JavaScript engine, not by either library: identical by construction.
const ENGINE_MESSAGES = [/^Cannot read properties of /, /^Cannot convert /, / is not a function$/];

const mentions = (message: string, name: string): boolean =>
	new RegExp(
		`(?<![A-Za-z0-9_$])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_$])`,
	).test(message);

/**
 * Compares `thrown` with a recorded failure: same built-in class (when recorded), a non-empty
 * message of Motio's own wording (engine messages excepted), and every name in `names` that the
 * recorded message mentions is mentioned by Motio's too, so the user is pointed at the same option.
 * Returns a description of the first difference, or `undefined` when the failures match.
 */
export function compareFailure(
	thrown: unknown,
	recorded: RecordedFailure,
	names: readonly string[] = [],
): string | undefined {
	const type = errorClassOf(thrown);
	if (type === undefined) return `threw a non-error value: ${String(thrown)}`;
	if (recorded.errorType !== undefined && type !== recorded.errorType) {
		return `threw a ${type}, the recording a ${recorded.errorType}`;
	}
	const message = String((thrown as Error).message ?? "");
	if (message.trim() === "") return "threw an error with an empty message";
	if (message === recorded.error && !ENGINE_MESSAGES.some((re) => re.test(message))) {
		return `the message is the recorded wording, not Motio's own: ${message}`;
	}
	for (const name of names) {
		if (mentions(recorded.error, name) && !mentions(message, name)) {
			return `the message does not name ${name}: ${message}`;
		}
	}
	return undefined;
}
