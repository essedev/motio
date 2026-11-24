/**
 * The Flipbook mark: three frames fanned out under a thumb (D-077). One geometry for every
 * use: the static SVG files in `brand/`, the favicons, and the animated logo of the site.
 * Motion comes from Motio's own `spring()`, sampled per frame at 30 fps.
 */
import { measureSpring, spring } from "@motiojs/core";

/** Brand palette. Text on any colour field is Plum. */
export const PALETTE = {
	paper: "#FFFFFF",
	plum: "#2A0E2E",
	night: "#1C0B1F",
	mist: "#F6EFF4",
	pulse: "#FF3D8B",
	spark: "#FFDD3C",
	drift: "#12B5A5",
} as const;

export const FPS = 30;
/** Overshoot for brand moments: the logo, the hero. */
export const BRAND_SPRING = { damping: 12, stiffness: 120 } as const;
/** No bounce, for interface motion. */
export const CALM_SPRING = { damping: 200 } as const;

/** Pivot of the fan and the frame rectangle, in the 64-unit design grid. */
const PIVOT = { x: 21, y: 51 } as const;
const FRAME = { x: 0, y: -26, w: 34, h: 26, r: 5 } as const;
/** Half the gap between two frames: each frame is drawn inset by it, and cuts the one behind
 * with an outline outset by it. */
const HALF_GAP = 1.75;

export type Tone = "color" | "ink" | "mist";

/** The three frames, back to front: resting angle, colour, and when they start moving. */
export const CARDS = [
	{ key: "back", angle: -44, color: PALETTE.drift, delay: 6 },
	{ key: "mid", angle: -22, color: PALETTE.spark, delay: 3 },
	{ key: "front", angle: 0, color: PALETTE.pulse, delay: 0 },
] as const;

export const toneColors = (tone: Tone): [string, string, string] => {
	if (tone === "ink") return [PALETTE.plum, PALETTE.plum, PALETTE.plum];
	if (tone === "mist") return [PALETTE.mist, PALETTE.mist, PALETTE.mist];
	return [PALETTE.drift, PALETTE.spark, PALETTE.pulse];
};

const fmt = (n: number) => Number(n.toFixed(3)).toString();

const rectAttrs = (grow: number) => {
	const x = FRAME.x - grow;
	const y = FRAME.y - grow;
	return `x="${fmt(x)}" y="${fmt(y)}" width="${fmt(FRAME.w + grow * 2)}" height="${fmt(FRAME.h + grow * 2)}" rx="${fmt(FRAME.r + grow)}"`;
};

const placed = (angle: number) => `translate(${PIVOT.x} ${PIVOT.y}) rotate(${angle})`;

/** Bounding box of the resting mark, in design units. */
export const markBounds = () => {
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const card of CARDS) {
		const a = (card.angle * Math.PI) / 180;
		const x0 = FRAME.x + HALF_GAP;
		const y0 = FRAME.y + HALF_GAP;
		const x1 = FRAME.x + FRAME.w - HALF_GAP;
		const y1 = FRAME.y + FRAME.h - HALF_GAP;
		for (const [x, y] of [
			[x0, y0],
			[x1, y0],
			[x0, y1],
			[x1, y1],
		] as const) {
			const px = PIVOT.x + x * Math.cos(a) - y * Math.sin(a);
			const py = PIVOT.y + x * Math.sin(a) + y * Math.cos(a);
			minX = Math.min(minX, px);
			maxX = Math.max(maxX, px);
			minY = Math.min(minY, py);
			maxY = Math.max(maxY, py);
		}
	}
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
};

/**
 * The resting mark as SVG elements with transparent gaps (masks), so it sits on any
 * background. `id` prefixes the mask ids, which must be unique in a document.
 */
export const markElements = (tone: Tone, id: string) => {
	const colors = toneColors(tone);
	const cut = (angles: number[]) =>
		`<rect x="-64" y="-64" width="192" height="192" fill="#fff"/>${angles
			.map((a) => `<rect ${rectAttrs(HALF_GAP)} transform="${placed(a)}" fill="#000"/>`)
			.join("")}`;
	const masks =
		`<mask id="${id}-back" maskUnits="userSpaceOnUse" x="-64" y="-64" width="192" height="192">${cut([-22, 0])}</mask>` +
		`<mask id="${id}-mid" maskUnits="userSpaceOnUse" x="-64" y="-64" width="192" height="192">${cut([0])}</mask>`;
	const card = (i: 0 | 1 | 2) => {
		const c = CARDS[i];
		return `<rect ${rectAttrs(-HALF_GAP)} transform="${placed(c.angle)}" fill="${colors[i]}"/>`;
	};
	return `<defs>${masks}</defs><g mask="url(#${id}-back)">${card(0)}</g><g mask="url(#${id}-mid)">${card(1)}</g>${card(2)}`;
};

/** Values of a spring sampled once per frame until it settles, as a CSS `linear()` easing. */
export const springEasing = (config: Parameters<typeof spring>[0]["config"], frames?: number) => {
	const settle = frames ?? measureSpring({ fps: FPS, config });
	const values: string[] = [];
	for (let f = 0; f <= settle; f++) {
		const v = frames
			? spring({ frame: f, fps: FPS, config, durationInFrames: frames })
			: spring({ frame: f, fps: FPS, config });
		values.push(fmt(f === settle ? 1 : v));
	}
	return { frames: settle, easing: `linear(${values.join(", ")})` };
};

const sec = (frames: number) => `${fmt(frames / FPS)}s`;

/**
 * CSS for the animated SVG mark: frames scale in, then fan out with the brand spring. Works on
 * `.mk-card-{back,mid,front}` groups inside a 64-unit SVG. The resting frame is the static style;
 * the animation applies only without reduced motion.
 */
export const markAnimationCss = (scope: string) => {
	const brand = springEasing(BRAND_SPRING);
	const calm = springEasing(CALM_SPRING, 8);
	const resting = CARDS.map(
		(c) =>
			`${scope} .mk-card-${c.key}{transform-box:view-box;transform-origin:${PIVOT.x}px ${PIVOT.y}px;rotate:${c.angle}deg}`,
	).join("");
	const playing = CARDS.map((c) => {
		const anims = [`mk-scale ${sec(calm.frames)} ${calm.easing} backwards`];
		if (c.angle !== 0)
			anims.push(`mk-fan-${c.key} ${sec(brand.frames)} ${brand.easing} ${sec(c.delay)} backwards`);
		return `${scope}.is-playing .mk-card-${c.key}{animation:${anims.join(",")}}`;
	}).join("");
	const keys = CARDS.filter((c) => c.angle !== 0)
		.map((c) => `@keyframes mk-fan-${c.key}{from{rotate:0deg}to{rotate:${c.angle}deg}}`)
		.join("");
	// With reduced motion the animations never apply: the resting frame shows at once.
	const rules = `${resting}@media (prefers-reduced-motion: no-preference){${playing}}`;
	return `${rules}@keyframes mk-scale{from{scale:0}to{scale:1}}${keys}`;
};

/** Geometry for the site's animated logo: each frame as a group to rotate about the pivot. */
export const LOGO_GEOMETRY = {
	pivot: PIVOT,
	frame: FRAME,
	gap: HALF_GAP * 2,
	cards: CARDS,
	/** Delay of letter `i` of the wordmark, in frames: it rises after the frames fan out. */
	letterDelay: (i: number) => 5 + i * 2,
} as const;

/**
 * A standalone animated SVG of the colour mark with transparent gaps: the cut-outs in the masks
 * move with the frames in front of them. Plays once when the file loads.
 */
export const animatedMarkSvg = (box: { x: number; y: number; w: number; h: number }) => {
	const [back, mid, front] = CARDS;
	const card = (key: string, fill: string) =>
		`<g class="mk-card-${key}"><rect ${rectAttrs(-HALF_GAP)} transform="translate(${PIVOT.x} ${PIVOT.y})" fill="${fill}"/></g>`;
	const cut = (key: string) =>
		`<g class="mk-card-${key}"><rect ${rectAttrs(HALF_GAP)} transform="translate(${PIVOT.x} ${PIVOT.y})" fill="#000"/></g>`;
	const full = `<rect x="-64" y="-64" width="192" height="192" fill="#fff"/>`;
	const area = `maskUnits="userSpaceOnUse" x="-64" y="-64" width="192" height="192"`;
	const view = [box.x, box.y, box.w, box.h].map((n) => Number(n.toFixed(2))).join(" ");
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" role="img" aria-labelledby="t" class="mk is-playing"><title id="t">Motio</title><style>${markAnimationCss(".mk")}</style><defs><mask id="mk-back" ${area}>${full}${cut(mid.key)}${cut(front.key)}</mask><mask id="mk-mid" ${area}>${full}${cut(front.key)}</mask></defs><g mask="url(#mk-back)">${card(back.key, back.color)}</g><g mask="url(#mk-mid)">${card(mid.key, mid.color)}</g>${card(front.key, front.color)}</svg>\n`;
};
