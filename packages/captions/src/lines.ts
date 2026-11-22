/** Splits text into lines on CRLF, CR or LF, after removing a leading byte order mark. */
export const splitLines = (input: string): string[] =>
	(input.charCodeAt(0) === 0xfeff ? input.slice(1) : input).split(/\r\n|\r|\n/);

/** True for a line that is empty or only whitespace. */
export const isBlank = (line: string): boolean => line.trim() === "";
