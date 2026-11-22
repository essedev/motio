import type { FrameWarning } from "../protocol.js";

const GENERIC = new Set([
	"serif",
	"sans-serif",
	"monospace",
	"cursive",
	"fantasy",
	"system-ui",
	"ui-serif",
	"ui-sans-serif",
	"ui-monospace",
	"ui-rounded",
	"math",
	"emoji",
	"fangsong",
	"-apple-system",
	"blinkmacsystemfont",
]);

const PROBE = "mmmmmmmmmmlli1WQ@#é";
const MAX_TEXT_NODES = 2000;

/** The families of a computed `font-family` value, unquoted. */
export function parseFontFamilies(value: string): string[] {
	const out: string[] = [];
	for (const raw of value.split(",")) {
		const name = raw.trim().replace(/^["']|["']$/g, "");
		if (name) out.push(name);
	}
	return out;
}

/**
 * Detects text whose first font family is not available, so the browser fell back to another
 * font. Uses `FontFace` status when the family is declared, and a canvas width probe otherwise.
 */
export class FontFallbackDetector {
	private readonly available = new Map<string, boolean>();
	private ctx: CanvasRenderingContext2D | null | undefined;

	private context(): CanvasRenderingContext2D | null {
		if (this.ctx === undefined) {
			try {
				this.ctx = document.createElement("canvas").getContext("2d");
			} catch {
				// Environments without canvas (jsdom) cannot probe fonts: detection is skipped.
				this.ctx = null;
			}
		}
		return this.ctx;
	}

	/** Whether `family` renders with its own glyphs, or null when it cannot be told. */
	isAvailable(family: string): boolean | null {
		const key = family.toLowerCase();
		if (GENERIC.has(key)) return true;
		const cached = this.available.get(key);
		if (cached !== undefined) return cached;
		let declared = false;
		let loaded = false;
		for (const face of document.fonts as unknown as Iterable<FontFace>) {
			if (face.family.replace(/^["']|["']$/g, "").toLowerCase() !== key) continue;
			declared = true;
			if (face.status === "loaded") loaded = true;
		}
		// Declared faces are checked every time: one may still be added or finish loading.
		if (declared) return loaded;
		const ctx = this.context();
		if (!ctx) return null;
		const width = (font: string) => {
			ctx.font = font;
			return ctx.measureText(PROBE).width;
		};
		const quoted = `"${family.replace(/"/g, '\\"')}"`;
		const result =
			width(`72px ${quoted}, monospace`) !== width("72px monospace") ||
			width(`72px ${quoted}, serif`) !== width("72px serif");
		this.available.set(key, result);
		return result;
	}

	/** Warnings for the text under `root` whose first font family is unavailable. */
	scan(root: Element): FrameWarning[] {
		if (typeof document === "undefined" || !document.fonts) return [];
		const missing = new Set<string>();
		const seen = new WeakSet<Element>();
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		let count = 0;
		for (let node = walker.nextNode(); node && count < MAX_TEXT_NODES; node = walker.nextNode()) {
			if (!node.textContent?.trim()) continue;
			const el = node.parentElement;
			if (!el || seen.has(el)) continue;
			seen.add(el);
			count++;
			const first = parseFontFamilies(getComputedStyle(el).fontFamily)[0];
			if (first && this.isAvailable(first) === false) missing.add(first);
		}
		return [...missing].map((family) => ({
			code: "W_FONT_FALLBACK" as const,
			message: `Font "${family}" is not available; its text fell back to another font. Load it before rendering (FontFace or @font-face) or check its name.`,
		}));
	}
}
