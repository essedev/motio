/**
 * Generates the brand kit in `brand/` and the icons in `website/public/` from one geometry
 * (`src/brand/mark.ts`) and the Anybody font: SVG marks and lockups with the wordmark outlined,
 * an animated mark and favicons (SVG, ICO, PNG). The Open Graph card and the README banner are
 * rendered by Motio itself, from `promo/` (`make promo`).
 * PNGs are rasterized by the pinned chrome-headless-shell (`motio browser ensure`).
 *
 * Run with `make brand`. The outputs are committed; run it again after changing the geometry.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as fontkit from "fontkit";
import {
	animatedMarkSvg,
	BRAND_SPRING,
	markBounds,
	markElements,
	PALETTE,
	type Tone,
} from "../src/brand/mark.ts";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const root = resolve(site, "..");
const brandDir = join(root, "brand");
const publicDir = join(site, "public");
const require = createRequire(import.meta.url);

const fontFile = (pkg: string, file: string) =>
	join(dirname(require.resolve(`${pkg}/package.json`)), "files", file);
const ANYBODY = fontFile("@fontsource-variable/anybody", "anybody-latin-wdth-normal.woff2");

/** Wordmark settings, as in the concept: Anybody 800, width 112, tracking -0.015 em. */
const WORDMARK = { text: "motio", weight: 800, width: 112, tracking: -0.015 } as const;

type Box = { x: number; y: number; w: number; h: number };

/** The wordmark as one SVG path at 1 em = 1000 units, baseline at y = 0. */
const outlineWordmark = () => {
	const opened = fontkit.openSync(ANYBODY);
	const base = "fonts" in opened ? opened.fonts[0] : opened;
	if (!base || !("getVariation" in base)) throw new Error(`${ANYBODY} is not a variable font`);
	const font = base.getVariation({ wght: WORDMARK.weight, wdth: WORDMARK.width });
	const scale = 1000 / font.unitsPerEm;
	const run = font.layout(WORDMARK.text);
	let x = 0;
	let d = "";
	let minY = Number.POSITIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	run.glyphs.forEach((glyph: fontkit.Glyph, i: number) => {
		const path = glyph.path.scale(scale, -scale).translate(x, 0);
		d += path.toSVG();
		const box = path.bbox;
		minY = Math.min(minY, box.minY);
		maxY = Math.max(maxY, box.maxY);
		x += (run.positions[i]?.xAdvance ?? 0) * scale;
		if (i < run.glyphs.length - 1) x += WORDMARK.tracking * 1000;
	});
	return {
		d,
		advance: x,
		top: minY,
		bottom: maxY,
		ascent: font.ascent * scale,
		descent: font.descent * scale,
	};
};

const svgDoc = (box: Box, title: string, body: string, extra = "") =>
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${[box.x, box.y, box.w, box.h].map((n) => Number(n.toFixed(2))).join(" ")}" role="img" aria-labelledby="t"${extra}><title id="t">${title}</title>${body}</svg>\n`;

/** Square box around the mark with the given padding as a share of the mark's larger side. */
const squareAround = (b: Box, pad: number): Box => {
	const side = Math.max(b.w, b.h) * (1 + pad * 2);
	return { x: b.x + b.w / 2 - side / 2, y: b.y + b.h / 2 - side / 2, w: side, h: side };
};

const MARK = markBounds();

/** Lockup: the mark (64 units = 1.18 em, as in the concept) and the wordmark, 0.22 em apart. */
const lockup = (tone: Tone, ink: string, id: string) => {
	const wm = outlineWordmark();
	const em = 64 / 1.18;
	const s = em / 1000;
	// Line box of 1 em centred on the 64-unit mark box; baseline after the half-leading.
	const content = wm.ascent - wm.descent;
	const baseline = (64 - em) / 2 + ((1000 - content) / 2 + wm.ascent) * s;
	const textX = 64 + 0.22 * em;
	const left = MARK.x;
	const right = 64 + 0.22 * em + wm.advance * s;
	const top = Math.min(MARK.y, baseline + wm.top * s);
	const bottom = Math.max(MARK.y + MARK.h, baseline + wm.bottom * s);
	const box = { x: left, y: top, w: right - left, h: bottom - top };
	const body = `${markElements(tone, id)}<path transform="translate(${textX.toFixed(3)} ${baseline.toFixed(3)}) scale(${s.toFixed(5)})" fill="${ink}" d="${wm.d}"/>`;
	return { box, body };
};

const write = (path: string, content: string | Buffer) => {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
};

const chrome = () => {
	const base = join(homedir(), ".cache", "motio", "browsers", "chrome-headless-shell");
	const dir = existsSync(base)
		? readdirSync(base).find((d) => d.startsWith("mac") || d.startsWith("linux"))
		: undefined;
	if (!dir)
		throw new Error("chrome-headless-shell not found: run `pnpm exec motio browser ensure`.");
	const inner = readdirSync(join(base, dir)).find((d) => d.startsWith("chrome-headless-shell"));
	if (!inner) throw new Error(`Unexpected layout in ${join(base, dir)}`);
	return join(base, dir, inner, "chrome-headless-shell");
};

/** Screenshot an HTML document at an exact size with a transparent background. */
const rasterize = (html: string, width: number, height: number, out: string) => {
	const work = join(tmpdir(), `motio-brand-${process.pid}`);
	mkdirSync(work, { recursive: true });
	const page = join(work, "page.html");
	writeFileSync(page, html);
	mkdirSync(dirname(out), { recursive: true });
	execFileSync(
		chrome(),
		[
			"--headless",
			"--hide-scrollbars",
			"--force-device-scale-factor=1",
			"--default-background-color=00000000",
			`--window-size=${width},${height}`,
			`--screenshot=${out}`,
			pathToFileURL(page).href,
		],
		{ stdio: "ignore" },
	);
	rmSync(work, { recursive: true, force: true });
};

const pngOfSvg = (svg: string, size: number, out: string, background = "transparent") =>
	rasterize(
		`<!doctype html><style>html,body{margin:0;background:${background}}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
		size,
		size,
		out,
	);

/** ICO with PNG entries (supported by every browser that reads ICO). */
const ico = (pngs: { size: number; data: Buffer }[]) => {
	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(pngs.length, 4);
	let offset = 6 + pngs.length * 16;
	const entries = pngs.map(({ size, data }) => {
		const e = Buffer.alloc(16);
		e.writeUInt8(size >= 256 ? 0 : size, 0);
		e.writeUInt8(size >= 256 ? 0 : size, 1);
		e.writeUInt16LE(1, 4);
		e.writeUInt16LE(32, 6);
		e.writeUInt32LE(data.length, 8);
		e.writeUInt32LE(offset, 12);
		offset += data.length;
		return e;
	});
	return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
};

// Marks
const markBox = squareAround(MARK, 0.06);
const marks: Record<string, [Tone, string]> = {
	"motio-mark.svg": ["color", "Motio"],
	"motio-mark-ink.svg": ["ink", "Motio"],
	"motio-mark-mist.svg": ["mist", "Motio"],
};
for (const [file, [tone, title]] of Object.entries(marks)) {
	write(join(brandDir, file), svgDoc(markBox, title, markElements(tone, "mk")));
}
write(join(brandDir, "motio-mark-animated.svg"), animatedMarkSvg(markBox));

// Lockups
const lockups: Record<string, [Tone, string]> = {
	"motio-lockup.svg": ["color", PALETTE.plum],
	"motio-lockup-on-dark.svg": ["color", PALETTE.mist],
	"motio-lockup-ink.svg": ["ink", PALETTE.plum],
	"motio-lockup-mist.svg": ["mist", PALETTE.mist],
};
for (const [file, [tone, ink]] of Object.entries(lockups)) {
	const { box, body } = lockup(tone, ink, "mk");
	write(join(brandDir, file), svgDoc(box, "Motio", body));
}

// Favicons: the colour mark on transparent; app icons on a Plum field.
const favDir = join(brandDir, "favicon");
const favicon = svgDoc(squareAround(MARK, 0.02), "Motio", markElements("color", "mk"));
write(join(favDir, "favicon.svg"), favicon);
const pngs: { size: number; data: Buffer }[] = [];
for (const size of [16, 32, 48]) {
	const out = join(favDir, `favicon-${size}.png`);
	pngOfSvg(favicon, size, out);
	pngs.push({ size, data: readFileSync(out) });
}
write(join(favDir, "favicon.ico"), ico(pngs));
const appIcon = svgDoc(
	{ x: 0, y: 0, w: 64, h: 64 },
	"Motio",
	`<rect width="64" height="64" fill="${PALETTE.plum}"/><g transform="translate(32 32) scale(0.78) translate(${-(MARK.x + MARK.w / 2)} ${-(MARK.y + MARK.h / 2)})">${markElements("color", "mk")}</g>`,
);
write(join(favDir, "app-icon.svg"), appIcon);
pngOfSvg(appIcon, 180, join(favDir, "apple-touch-icon.png"));
pngOfSvg(appIcon, 192, join(favDir, "icon-192.png"));
pngOfSvg(appIcon, 512, join(favDir, "icon-512.png"));

for (const file of [
	"favicon.svg",
	"favicon.ico",
	"apple-touch-icon.png",
	"icon-192.png",
	"icon-512.png",
]) {
	write(join(publicDir, file), readFileSync(join(favDir, file)));
}
write(
	join(publicDir, "site.webmanifest"),
	`${JSON.stringify(
		{
			name: "Motio",
			short_name: "Motio",
			icons: [
				{ src: "/icon-192.png", sizes: "192x192", type: "image/png" },
				{ src: "/icon-512.png", sizes: "512x512", type: "image/png" },
			],
			theme_color: PALETTE.plum,
			background_color: PALETTE.paper,
			display: "standalone",
		},
		null,
		"\t",
	)}\n`,
);

// Licences of the self-hosted fonts, served next to them (SIL OFL 1.1 asks every copy to carry it).
for (const [pkg, name] of [
	["@fontsource-variable/anybody", "Anybody"],
	["@fontsource-variable/instrument-sans", "Instrument-Sans"],
	["@fontsource/ibm-plex-mono", "IBM-Plex-Mono"],
] as const) {
	write(
		join(publicDir, "fonts", `OFL-${name}.txt`),
		readFileSync(join(dirname(require.resolve(`${pkg}/package.json`)), "LICENSE")),
	);
}

console.log(
	`Brand kit written to ${brandDir}; brand spring ${JSON.stringify(BRAND_SPRING)}; icons in ${publicDir}.`,
);
