import type { CSSProperties } from "react";

type FillKey =
	| "position"
	| "top"
	| "left"
	| "right"
	| "bottom"
	| "width"
	| "height"
	| "display"
	| "flexDirection";

const BASE: Required<Pick<CSSProperties, FillKey>> = {
	position: "absolute",
	top: 0,
	left: 0,
	right: 0,
	bottom: 0,
	width: "100%",
	height: "100%",
	display: "flex",
	flexDirection: "column",
};

const DISPLAY =
	/^(block|inline-block|inline|flex|inline-flex|table|inline-table|table-caption|table-cell|table-column|table-column-group|table-footer-group|table-header-group|table-row-group|table-row|flow-root|grid|inline-grid|contents|list-item|hidden)$/;

/** Tailwind utilities that set each default style; a match drops the inline default. */
const CONFLICTS: ReadonlyArray<readonly [FillKey, RegExp]> = [
	["position", /^(static|fixed|absolute|relative|sticky)$/],
	["top", /^-?(inset|inset-y|top)-/],
	["bottom", /^-?(inset|inset-y|bottom)-/],
	["left", /^-?(inset|inset-x|left|start)-/],
	["right", /^-?(inset|inset-x|right|end)-/],
	["width", /^(w|size)-/],
	["height", /^(h|size)-/],
	["display", DISPLAY],
	["flexDirection", /^flex-(row|col|row-reverse|col-reverse)$/],
];

/** The utility name of a Tailwind class, without variants (`md:`) and importance (`!`). */
function utility(cls: string): string {
	let depth = 0;
	let start = 0;
	for (let i = 0; i < cls.length; i++) {
		const c = cls[i];
		if (c === "[") depth++;
		else if (c === "]") depth--;
		else if (c === ":" && depth === 0) start = i + 1;
	}
	let u = cls.slice(start);
	if (u.startsWith("!")) u = u.slice(1);
	if (u.endsWith("!")) u = u.slice(0, -1);
	return u;
}

const cache = new Map<string, CSSProperties>();

/**
 * The default styles of `AbsoluteFill`, minus those a Tailwind class in `className` sets, so the
 * class can take effect (inline styles would otherwise win).
 */
export function absoluteFillStyle(className: string | undefined): CSSProperties {
	if (!className) return BASE;
	const hit = cache.get(className);
	if (hit) return hit;
	const style: CSSProperties = { ...BASE };
	for (const cls of className.split(/\s+/)) {
		if (!cls) continue;
		const u = utility(cls);
		for (const [key, pattern] of CONFLICTS) {
			if (pattern.test(u)) delete style[key];
		}
	}
	if (cache.size > 500) cache.clear();
	cache.set(className, style);
	return style;
}
