import type { TextLineSize } from "./make-text-background.js";

/** The lines of a rendered text, in the local coordinates of its container's padding box. */
export interface MeasuredLines {
	lines: TextLineSize[];
	/** Left edge of each line, in the same coordinates. */
	lefts: number[];
	/** Top of the first line's band (the content box top). */
	top: number;
}

/** Distance between the markers, in CSS pixels. */
export const MARKER_SPAN = 100;

type Rect = { left: number; right: number; top: number; bottom: number };

/**
 * Groups the fragments of an inline element into lines: fragments whose vertical centres lie
 * within half a fragment height of each other share a line (an inline element has one fragment
 * per line, more around bidirectional text or inline blocks).
 */
function groupLines(rects: Rect[]): Rect[] {
	const sorted = [...rects].sort((a, b) => a.top + a.bottom - (b.top + b.bottom));
	const lines: Rect[] = [];
	for (const r of sorted) {
		const line = lines[lines.length - 1];
		const centre = (r.top + r.bottom) / 2;
		if (
			line &&
			Math.abs((line.top + line.bottom) / 2 - centre) <
				Math.min(line.bottom - line.top, r.bottom - r.top) / 2
		) {
			line.left = Math.min(line.left, r.left);
			line.right = Math.max(line.right, r.right);
			line.top = Math.min(line.top, r.top);
			line.bottom = Math.max(line.bottom, r.bottom);
		} else {
			lines.push({ ...r });
		}
	}
	return lines;
}

/**
 * Measures the lines the browser laid out for `text`, an inline element inside `root`. `markers`
 * are three zero-size elements at (0, 0), (100, 0) and (0, 100) of `root`'s padding box: their
 * positions on screen give the transform from `root`'s coordinates to the screen, so the result
 * does not depend on the scale of the Player or of any ancestor. Under a rotation or skew the
 * fragments' screen rectangles are no longer the lines' boxes; the text is then cloned into a
 * hidden layer inside `root` that cancels the transform, and measured there.
 *
 * Each line's height is its band: from halfway to the line above to halfway to the line below,
 * the first starting at the content box top and the last ending at its bottom, so the bands
 * stack without gaps whatever the line height.
 */
export function measureLines(
	root: HTMLElement,
	text: HTMLElement,
	markers: readonly [HTMLElement, HTMLElement, HTMLElement],
): MeasuredLines {
	const [o, x, y] = markers.map((m) => m.getBoundingClientRect()) as [DOMRect, DOMRect, DOMRect];
	const a = (x.left - o.left) / MARKER_SPAN;
	const b = (x.top - o.top) / MARKER_SPAN;
	const c = (y.left - o.left) / MARKER_SPAN;
	const d = (y.top - o.top) / MARKER_SPAN;
	const style = getComputedStyle(root);
	const paddingLeft = Number.parseFloat(style.paddingLeft);
	const paddingTop = Number.parseFloat(style.paddingTop);
	const contentHeight = Number.parseFloat(style.height);
	const scale = Math.max(Math.abs(a), Math.abs(d), Number.MIN_VALUE);

	let rects: Rect[];
	if (Math.abs(b) < 1e-6 * scale && Math.abs(c) < 1e-6 * scale && a !== 0 && d !== 0) {
		rects = [...text.getClientRects()].map((r) => {
			const x1 = (r.left - o.left) / a;
			const x2 = (r.right - o.left) / a;
			const y1 = (r.top - o.top) / d;
			const y2 = (r.bottom - o.top) / d;
			return {
				left: Math.min(x1, x2),
				right: Math.max(x1, x2),
				top: Math.min(y1, y2),
				bottom: Math.max(y1, y2),
			};
		});
	} else {
		rects = measureUntransformed(root, text, { a, b, c, d }, style, paddingLeft, paddingTop);
	}

	const lines = groupLines(rects.filter((r) => r.bottom > r.top));
	const bottom = paddingTop + contentHeight;
	const centres = lines.map((l) => (l.top + l.bottom) / 2);
	const bands = lines.map((_l, i) => {
		const from = i === 0 ? paddingTop : ((centres[i - 1] as number) + (centres[i] as number)) / 2;
		const to =
			i === lines.length - 1 ? bottom : ((centres[i] as number) + (centres[i + 1] as number)) / 2;
		return to - from;
	});
	return {
		lines: lines.map((l, i) => ({ width: l.right - l.left, height: bands[i] as number })),
		lefts: lines.map((l) => l.left),
		top: paddingTop,
	};
}

/** Fragment rectangles of a clone of `text` in a layer of `root` that cancels the transform. */
function measureUntransformed(
	root: HTMLElement,
	text: HTMLElement,
	m: { a: number; b: number; c: number; d: number },
	style: CSSStyleDeclaration,
	paddingLeft: number,
	paddingTop: number,
): Rect[] {
	const det = m.a * m.d - m.b * m.c;
	if (det === 0) return [];
	const layer = document.createElement("div");
	const inverse = [m.d / det, -m.b / det, -m.c / det, m.a / det];
	Object.assign(layer.style, {
		position: "absolute",
		left: `${paddingLeft}px`,
		top: `${paddingTop}px`,
		width: style.width,
		margin: "0",
		padding: "0",
		border: "0",
		visibility: "hidden",
		pointerEvents: "none",
		transformOrigin: "0 0",
		transform: `matrix(${inverse.join(",")},0,0)`,
	});
	const clone = text.cloneNode(true) as HTMLElement;
	layer.appendChild(clone);
	root.appendChild(layer);
	try {
		const origin = layer.getBoundingClientRect();
		return [...clone.getClientRects()].map((r) => ({
			left: r.left - origin.left + paddingLeft,
			right: r.right - origin.left + paddingLeft,
			top: r.top - origin.top + paddingTop,
			bottom: r.bottom - origin.top + paddingTop,
		}));
	} finally {
		layer.remove();
	}
}
