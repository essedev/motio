import { createInterface } from "node:readline";
import { MotioError } from "@motiojs/compat";

/** One choice of a prompt. */
export interface Choice<T extends string> {
	value: T;
	label: string;
	hint?: string;
}

/** Asks the user questions on a terminal; injectable for tests. */
export interface Prompter {
	/** Asks for free text; an empty answer gives `initial`. */
	text(question: string, initial: string): Promise<string>;
	/** Asks to pick one of `choices` by number; an empty answer gives `initial`. */
	select<T extends string>(question: string, choices: readonly Choice<T>[], initial: T): Promise<T>;
	close(): void;
}

function inputClosed(): MotioError {
	return new MotioError(
		"E_PROMPT_CLOSED",
		"The input closed before every question was answered. Pass the answers as flags (--template, --pm) or --yes for the defaults.",
	);
}

/**
 * A prompter on stdin and stderr (stdout stays free for the result). Numbered choices instead of
 * arrow-key menus: no dependency, and it works in every terminal and over a pipe in tests.
 */
export function terminalPrompter(
	input: NodeJS.ReadableStream = process.stdin,
	output: NodeJS.WritableStream = process.stderr,
): Prompter {
	const rl = createInterface({ input, output, terminal: false });
	// Lines are queued as they arrive, so answers piped in before a question is printed are not
	// lost (readline's question() only sees lines that arrive after it is called). Input that ends
	// (Ctrl+D, a closed pipe) fails the pending question instead of hanging.
	const lines: string[] = [];
	const waiting: Array<{ resolve: (line: string) => void; reject: (error: Error) => void }> = [];
	let closed = false;
	rl.on("line", (line) => {
		const waiter = waiting.shift();
		if (waiter) waiter.resolve(line);
		else lines.push(line);
	});
	rl.once("close", () => {
		closed = true;
		for (const waiter of waiting.splice(0)) waiter.reject(inputClosed());
	});
	const ask = (question: string): Promise<string> => {
		output.write(question);
		const queued = lines.shift();
		if (queued !== undefined) return Promise.resolve(queued.trim());
		if (closed) return Promise.reject(inputClosed());
		return new Promise((resolve, reject) =>
			waiting.push({ resolve: (line) => resolve(line.trim()), reject }),
		);
	};
	return {
		async text(question, initial) {
			const answer = await ask(`${question} (${initial}): `);
			return answer === "" ? initial : answer;
		},
		async select(question, choices, initial) {
			const lines = choices.map((choice, index) => {
				const marker = choice.value === initial ? "*" : " ";
				return `${marker} ${index + 1}. ${choice.label}${choice.hint ? `  ${choice.hint}` : ""}`;
			});
			output.write(`${question}\n${lines.join("\n")}\n`);
			const defaultNumber = choices.findIndex((c) => c.value === initial) + 1;
			for (;;) {
				const answer = await ask(`Choose 1-${choices.length} (${defaultNumber}): `);
				if (answer === "") return initial;
				const byNumber = choices[Number(answer) - 1];
				if (/^\d+$/.test(answer) && byNumber) return byNumber.value;
				const byName = choices.find((c) => c.value === answer);
				if (byName) return byName.value;
				output.write(`"${answer}" is not one of the choices.\n`);
			}
		},
		close() {
			rl.close();
		},
	};
}
