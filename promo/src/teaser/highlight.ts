import type { CODE } from "../brand/tokens";

export type TokenKind = keyof typeof CODE;
export type Token = { text: string; kind: TokenKind };

const KEYWORDS = new Set([
	"import",
	"from",
	"export",
	"const",
	"let",
	"return",
	"if",
	"else",
	"new",
	"type",
	"as",
]);

// One alternative per kind of token, tried in order at each position of a line.
const PATTERN =
	/(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(`[^`$]*)|(\$\{)|(\d+(?:\.\d+)?)|(<\/?)([A-Za-z][\w.]*)|([A-Za-z_$][\w$]*)|(\s+)|([^\sA-Za-z_$\d"'`]+)/y;

/**
 * Splits one line of TSX into coloured tokens, enough for the short snippet the teaser shows:
 * no multi-line strings or comments. Template literals are split around `${...}`.
 */
export const highlightLine = (line: string): Token[] => {
	const tokens: Token[] = [];
	let inTemplate = false;
	let inInterpolation = false;
	PATTERN.lastIndex = 0;
	while (PATTERN.lastIndex < line.length) {
		const at = PATTERN.lastIndex;
		if (inInterpolation && line[at] === "}") {
			tokens.push({ text: "}", kind: "keyword" });
			PATTERN.lastIndex = at + 1;
			inInterpolation = false;
			inTemplate = true;
			continue;
		}
		if (inTemplate && line[at] !== "$") {
			// The rest of a template literal after `${...}`: up to its closing backtick.
			const close = line.indexOf("`", at);
			const end = close === -1 ? line.length : close + 1;
			tokens.push({ text: line.slice(at, end), kind: "string" });
			PATTERN.lastIndex = end;
			inTemplate = false;
			continue;
		}
		const m = PATTERN.exec(line);
		if (!m) throw new Error(`Cannot highlight "${line}" at column ${at}.`);
		const [, comment, str, tpl, interp, num, angle, tag, ident, space, punct] = m;
		const after = line.slice(PATTERN.lastIndex);
		if (comment) tokens.push({ text: comment, kind: "comment" });
		else if (str) tokens.push({ text: str, kind: "string" });
		else if (tpl) tokens.push({ text: tpl, kind: "string" });
		else if (interp) {
			tokens.push({ text: interp, kind: "keyword" });
			inInterpolation = true;
		} else if (num) tokens.push({ text: num, kind: "number" });
		else if (angle && tag) {
			tokens.push({ text: angle, kind: "punctuation" });
			tokens.push({ text: tag, kind: "tag" });
		} else if (ident) {
			const kind: TokenKind = KEYWORDS.has(ident)
				? "keyword"
				: /^\s*\(/.test(after)
					? "fn"
					: /^\s*:(?!:)/.test(after) || /^=/.test(after)
						? "key"
						: "text";
			tokens.push({ text: ident, kind });
		} else if (space) tokens.push({ text: space, kind: "text" });
		else if (punct) tokens.push({ text: punct, kind: "punctuation" });
	}
	return tokens;
};
