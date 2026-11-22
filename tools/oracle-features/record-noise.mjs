import { noise2D, noise3D, noise4D } from "@remotion/noise";
import { makeRng, writeFixture } from "./lib.mjs";

export const recordNoise = () => {
	const rng = makeRng(7);
	const seeds = [
		"my-seed",
		"",
		"a",
		"hello world",
		"üñíçødé",
		0,
		1,
		-1,
		0.5,
		42,
		123456789,
		-987.654,
		1e-7,
	];
	for (let i = 0; i < 12; i++) seeds.push(Math.floor(rng() * 1e6));
	for (let i = 0; i < 12; i++) seeds.push(`seed-${Math.floor(rng() * 1e6)}`);

	// Coordinates: integers (lattice points), small fractions, negatives and
	// large values, plus random points.
	const fixed = [0, 1, -1, 0.5, -0.25, 3.7, 10, 100.123, -250.5, 1e4 + 0.3];
	const coord = (i) => (i < fixed.length ? fixed[i] : (rng() - 0.5) * 400);
	const n = 40;

	const cases2 = seeds.map((seed) => {
		const points = Array.from({ length: n }, (_, i) => [coord(i), coord((i * 7 + 3) % n)]);
		return { seed, points, out: points.map(([x, y]) => noise2D(seed, x, y)) };
	});
	const cases3 = seeds.map((seed) => {
		const points = Array.from({ length: n }, (_, i) => [
			coord(i),
			coord((i * 7 + 3) % n),
			coord((i * 3 + 1) % n),
		]);
		return { seed, points, out: points.map(([x, y, z]) => noise3D(seed, x, y, z)) };
	});
	const cases4 = seeds.map((seed) => {
		const points = Array.from({ length: n }, (_, i) => [
			coord(i),
			coord((i * 7 + 3) % n),
			coord((i * 3 + 1) % n),
			coord((i * 11 + 5) % n),
		]);
		return { seed, points, out: points.map(([x, y, z, w]) => noise4D(seed, x, y, z, w)) };
	});
	writeFixture(
		"noise",
		"@remotion/noise",
		"noise",
		"noise2D/3D/4D over string and number seeds and a grid of coordinates",
		[
			...cases2.map((c) => ({ fn: "noise2D", ...c })),
			...cases3.map((c) => ({ fn: "noise3D", ...c })),
			...cases4.map((c) => ({ fn: "noise4D", ...c })),
		],
	);
};
