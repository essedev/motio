// Writes the Lottie animations of this fixture: src/shapes.json (imported) and public/badge.json
// (fetched through staticFile()). Deterministic; run `node generate.mjs && pnpm format` after editing.
// The animations are written by hand from the Lottie schema, so no third-party asset is needed.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const here = import.meta.dirname;

const fixed = (k) => ({ a: 0, k });
const ease = { o: { x: [0.33], y: [0] }, i: { x: [0.67], y: [1] } };
const linear = { o: { x: [0], y: [0] }, i: { x: [1], y: [1] } };
/** An animated property: keyframes as [time, value, easing?]; the last one has no easing. */
const animated = (...keys) => ({
	a: 1,
	k: keys.map(([t, s, e], i) => (i === keys.length - 1 ? { t, s } : { t, s, ...(e ?? ease) })),
});

const transform = (ks) => ({
	o: fixed(100),
	r: fixed(0),
	p: fixed([0, 0, 0]),
	a: fixed([0, 0, 0]),
	s: fixed([100, 100, 100]),
	...ks,
});
const groupTransform = { ty: "tr", p: fixed([0, 0]), a: fixed([0, 0]), s: fixed([100, 100]) };
const group = (name, items) => ({
	ty: "gr",
	nm: name,
	it: [...items, { ...groupTransform, r: fixed(0), o: fixed(100) }],
});
const fill = (c, o = fixed(100)) => ({ ty: "fl", c, o, r: 1 });
const stroke = (c, w) => ({ ty: "st", c: fixed(c), o: fixed(100), w: fixed(w), lc: 2, lj: 2 });

const shapeLayer = (ind, name, op, ks, shapes) => ({
	ddd: 0,
	ind,
	ty: 4,
	nm: name,
	sr: 1,
	ks: transform(ks),
	ao: 0,
	shapes,
	ip: 0,
	op,
	st: 0,
	bm: 0,
});

// 400x300 at 25 fps for 2 s: a square crossing and turning while its colour changes, a pulsing
// circle fading in and out, and a wave drawn by a trim path. 25 fps differs from the fixture's
// 30 fps, so the frame mapping shows.
const shapesOp = 50;
const shapes = {
	v: "5.7.4",
	fr: 25,
	ip: 0,
	op: shapesOp,
	w: 400,
	h: 300,
	nm: "shapes",
	ddd: 0,
	assets: [],
	layers: [
		shapeLayer(
			1,
			"square",
			shapesOp,
			{
				p: animated([0, [60, 90, 0]], [24, [200, 210, 0]], [49, [340, 90, 0]]),
				r: animated([0, [0]], [49, [270]]),
			},
			[
				group("square", [
					{ ty: "rc", d: 1, s: fixed([70, 70]), p: fixed([0, 0]), r: fixed(14) },
					fill(animated([0, [1, 0.2, 0.4, 1]], [49, [0.2, 0.8, 1, 1]])),
				]),
			],
		),
		shapeLayer(
			2,
			"circle",
			shapesOp,
			{
				p: fixed([200, 150, 0]),
				s: animated(
					[0, [40, 40, 100]],
					[20, [130, 130, 100]],
					[35, [80, 80, 100], linear],
					[49, [110, 110, 100]],
				),
				o: animated([0, [20]], [25, [100]], [49, [40]]),
			},
			[
				group("circle", [
					{ ty: "el", d: 1, s: fixed([90, 90]), p: fixed([0, 0]) },
					fill(fixed([0.11, 0.17, 0.33, 1])),
				]),
			],
		),
		shapeLayer(3, "wave", shapesOp, { p: fixed([0, 0, 0]) }, [
			group("wave", [
				{
					ty: "sh",
					d: 1,
					ks: fixed({
						c: false,
						v: [
							[30, 260],
							[130, 230],
							[230, 270],
							[370, 240],
						],
						i: [
							[0, 0],
							[-40, 0],
							[-40, 0],
							[-50, 0],
						],
						o: [
							[40, -30],
							[40, 0],
							[50, -20],
							[0, 0],
						],
					}),
				},
				{ ty: "tm", s: fixed(0), e: animated([0, [0]], [40, [100]]), o: fixed(0), m: 1 },
				stroke([0.95, 0.55, 0.1, 1], 8),
			]),
		]),
	],
};

// 200x200 at 60 fps for 1.5 s: a badge spinning, with a star scaling in. Fetched at runtime.
const badgeOp = 90;
const star = () => {
	const v = [];
	for (let i = 0; i < 10; i++) {
		const angle = (Math.PI * i) / 5 - Math.PI / 2;
		const radius = i % 2 === 0 ? 50 : 22;
		v.push([
			Math.round(Math.cos(angle) * radius * 100) / 100,
			Math.round(Math.sin(angle) * radius * 100) / 100,
		]);
	}
	const zero = v.map(() => [0, 0]);
	return { c: true, v, i: zero, o: zero };
};
const badge = {
	v: "5.7.4",
	fr: 60,
	ip: 0,
	op: badgeOp,
	w: 200,
	h: 200,
	nm: "badge",
	ddd: 0,
	assets: [],
	layers: [
		shapeLayer(
			1,
			"star",
			badgeOp,
			{
				p: fixed([100, 100, 0]),
				r: animated([0, [0]], [89, [-144]]),
				s: animated([0, [0, 0, 100]], [45, [100, 100, 100]]),
			},
			[group("star", [{ ty: "sh", d: 1, ks: fixed(star()) }, fill(fixed([1, 0.85, 0.2, 1]))])],
		),
		shapeLayer(
			2,
			"disc",
			badgeOp,
			{ p: fixed([100, 100, 0]), r: animated([0, [0]], [89, [360]]) },
			[
				group("disc", [
					{ ty: "rc", d: 1, s: fixed([150, 150]), p: fixed([0, 0]), r: fixed(30) },
					fill(fixed([0.4, 0.1, 0.6, 1])),
					stroke([1, 1, 1, 1], 6),
				]),
			],
		),
	],
};

const write = (path, data) => writeFileSync(join(here, path), `${JSON.stringify(data)}\n`);
write("src/shapes.json", shapes);
write("public/badge.json", badge);
