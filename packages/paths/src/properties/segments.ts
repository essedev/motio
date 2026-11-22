// Length, point and tangent of SVG path segments.
//
// Ported from svg-path-properties (https://github.com/rveciana/svg-path-properties),
// Copyright (c) 2016 Roger Veciana i Rovira, MIT License (full text in
// LICENSE-svg-path-properties.txt next to this file). Remotion documents its
// path measurements as stemming from this library.
//
// Changes: rewritten as plain functions; acos arguments are clamped, square
// roots replace Math.hypot and the angle between two vectors takes a single
// square root, which together reproduce Remotion's outputs bit for bit; the
// numerical methods (20-point Legendre-Gauss quadrature for cubic lengths,
// the closed form for quadratic lengths, a 300-step polyline for arc lengths,
// the bisection from length to curve parameter) are unchanged.

import type { Point } from "../instruction.js";

/** A measurable segment of a path. */
export type Segment = {
	length: number;
	/** Arc length from the start to curve parameter t (Bézier segments only). */
	lengthAtT?: (t: number) => number;
	/** True for elliptical arc segments. */
	isArc?: boolean;
	pointAt: (length: number) => Point;
	tangentAt: (length: number) => Point;
};

// 20-point Legendre-Gauss abscissae and weights.
const T_VALUES = [
	-0.07652652113349734, 0.07652652113349734, -0.22778585114164507, 0.22778585114164507,
	-0.37370608871541955, 0.37370608871541955, -0.5108670019508271, 0.5108670019508271,
	-0.636053680726515, 0.636053680726515, -0.7463319064601508, 0.7463319064601508,
	-0.8391169718222188, 0.8391169718222188, -0.912234428251326, 0.912234428251326,
	-0.9639719272779138, 0.9639719272779138, -0.9931285991850949, 0.9931285991850949,
];
const C_VALUES = [
	0.15275338713072584, 0.15275338713072584, 0.14917298647260374, 0.14917298647260374,
	0.14209610931838204, 0.14209610931838204, 0.13168863844917664, 0.13168863844917664,
	0.11819453196151841, 0.11819453196151841, 0.10193011981724044, 0.10193011981724044,
	0.08327674157670475, 0.08327674157670475, 0.06267204833410907, 0.06267204833410907,
	0.04060142980038694, 0.04060142980038694, 0.017614007139152118, 0.017614007139152118,
];

/** A straight segment from (x0, y0) to (x1, y1). */
export const lineSegment = (x0: number, y0: number, x1: number, y1: number): Segment => {
	const length = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
	return {
		length,
		pointAt: (pos) => {
			let fraction = pos / length;
			if (Number.isNaN(fraction)) fraction = 1;
			return { x: x0 + (x1 - x0) * fraction, y: y0 + (y1 - y0) * fraction };
		},
		tangentAt: () => ({ x: (x1 - x0) / length, y: (y1 - y0) / length }),
	};
};

// Derivative of a Bézier curve with control values vs, by repeated
// differencing (the hodograph), then evaluated with the Bernstein basis.
const hodograph = (t: number, vs: number[]): number => {
	const n = vs.length - 1;
	const d: number[] = [];
	for (let k = 0; k < n; k++) d.push(n * ((vs[k + 1] as number) - (vs[k] as number)));
	// d has degree n - 1; evaluate it.
	const m = d.length - 1;
	let value = 0;
	for (let k = 0; k <= m; k++) {
		value += binomial(m, k) * (1 - t) ** (m - k) * t ** k * (d[k] as number);
	}
	return value;
};

const BINOMIALS = [[1], [1, 1], [1, 2, 1], [1, 3, 3, 1]];
const binomial = (n: number, k: number): number => (BINOMIALS[n] as number[])[k] as number;

const cubicArcLength = (xs: number[], ys: number[], t: number): number => {
	const z = t / 2;
	let sum = 0;
	for (let i = 0; i < 20; i++) {
		const correctedT = z * (T_VALUES[i] as number) + z;
		const dx = hodograph(correctedT, xs);
		const dy = hodograph(correctedT, ys);
		sum += (C_VALUES[i] as number) * Math.sqrt(dx * dx + dy * dy);
	}
	return z * sum;
};

const quadraticArcLength = (xs: number[], ys: number[], t: number): number => {
	const [x0, x1, x2] = xs as [number, number, number];
	const [y0, y1, y2] = ys as [number, number, number];
	const ax = x0 - 2 * x1 + x2;
	const ay = y0 - 2 * y1 + y2;
	const bx = 2 * x1 - 2 * x0;
	const by = 2 * y1 - 2 * y0;
	const A = 4 * (ax * ax + ay * ay);
	const B = 4 * (ax * bx + ay * by);
	const C = bx * bx + by * by;
	if (A === 0) return t * Math.sqrt((x2 - x0) ** 2 + (y2 - y0) ** 2);
	const b = B / (2 * A);
	const c = C / A;
	const u = t + b;
	const k = c - b * b;
	const uuk = u * u + k > 0 ? Math.sqrt(u * u + k) : 0;
	const bbk = b * b + k > 0 ? Math.sqrt(b * b + k) : 0;
	const term =
		b + Math.sqrt(b * b + k) !== 0 && (u + uuk) / (b + bbk) !== 0
			? k * Math.log(Math.abs((u + uuk) / (b + bbk)))
			: 0;
	return (Math.sqrt(A) / 2) * (u * uuk - b * bbk + term);
};

const cubicPoint = (xs: number[], ys: number[], t: number): Point => {
	const [x0, x1, x2, x3] = xs as [number, number, number, number];
	const [y0, y1, y2, y3] = ys as [number, number, number, number];
	return {
		x:
			(1 - t) * (1 - t) * (1 - t) * x0 +
			3 * (1 - t) * (1 - t) * t * x1 +
			3 * (1 - t) * t * t * x2 +
			t * t * t * x3,
		y:
			(1 - t) * (1 - t) * (1 - t) * y0 +
			3 * (1 - t) * (1 - t) * t * y1 +
			3 * (1 - t) * t * t * y2 +
			t * t * t * y3,
	};
};

const quadraticPoint = (xs: number[], ys: number[], t: number): Point => {
	const [x0, x1, x2] = xs as [number, number, number];
	const [y0, y1, y2] = ys as [number, number, number];
	return {
		x: (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * x1 + t * t * x2,
		y: (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * y1 + t * t * y2,
	};
};

const quadraticDerivative = (xs: number[], ys: number[], t: number): Point => {
	const [x0, x1, x2] = xs as [number, number, number];
	const [y0, y1, y2] = ys as [number, number, number];
	return {
		x: (1 - t) * 2 * (x1 - x0) + t * 2 * (x2 - x1),
		y: (1 - t) * 2 * (y1 - y0) + t * 2 * (y2 - y1),
	};
};

const cubicDerivative = (xs: number[], ys: number[], t: number): Point => {
	const [x0, x1, x2, x3] = xs as [number, number, number, number];
	const [y0, y1, y2, y3] = ys as [number, number, number, number];
	return quadraticPoint(
		[3 * (x1 - x0), 3 * (x2 - x1), 3 * (x3 - x2)],
		[3 * (y1 - y0), 3 * (y2 - y1), 3 * (y3 - y2)],
		t,
	);
};

/** Curve parameter t at which the arc length is `length`, by bisection-like search. */
export const lengthToT = (
	length: number,
	totalLength: number,
	arcLength: (t: number) => number,
) => {
	let error = 1;
	let t = length / totalLength;
	let step = (length - arcLength(t)) / totalLength;
	let iterations = 0;
	while (error > 0.001) {
		const increasedError = Math.abs(length - arcLength(t + step)) / totalLength;
		if (increasedError < error) {
			error = increasedError;
			t += step;
		} else {
			const decreasedError = Math.abs(length - arcLength(t - step)) / totalLength;
			if (decreasedError < error) {
				error = decreasedError;
				t -= step;
			} else {
				step /= 2;
			}
		}
		iterations++;
		if (iterations > 500) break;
	}
	return t;
};

/** A cubic (4 control values per axis) or quadratic (3) Bézier segment. */
export const bezierSegment = (xs: number[], ys: number[]): Segment => {
	const cubic = xs.length === 4;
	const arcLength = cubic ? cubicArcLength : quadraticArcLength;
	const point = cubic ? cubicPoint : quadraticPoint;
	const derivative = cubic ? cubicDerivative : quadraticDerivative;
	const length = arcLength(xs, ys, 1);
	const tAt = (pos: number) => lengthToT(pos, length, (t) => arcLength(xs, ys, t));
	return {
		length,
		lengthAtT: (t) => arcLength(xs, ys, t),
		pointAt: (pos) => point(xs, ys, tAt(pos)),
		tangentAt: (pos) => {
			const d = derivative(xs, ys, tAt(pos));
			const module = Math.sqrt(d.x ** 2 + d.y ** 2);
			return module > 0 ? { x: d.x / module, y: d.y / module } : { x: 0, y: 0 };
		},
	};
};

const mod = (x: number, m: number) => ((x % m) + m) % m;

const angleBetween = (v0: Point, v1: Point): number => {
	const p = v0.x * v1.x + v0.y * v1.y;
	const n = Math.sqrt((v0.x ** 2 + v0.y ** 2) * (v1.x ** 2 + v1.y ** 2));
	const sign = v0.x * v1.y - v0.y * v1.x < 0 ? -1 : 1;
	// Clamped: rounding can push the cosine just outside [-1, 1].
	return sign * Math.acos(Math.min(1, Math.max(-1, p / n)));
};

type ArcParams = {
	x0: number;
	y0: number;
	rx: number;
	ry: number;
	xAxisRotation: number;
	largeArc: boolean;
	sweep: boolean;
	x1: number;
	y1: number;
};

/** Point at parameter t in [0, 1], linear in the angle swept along the ellipse. */
const pointOnArc = (a: ArcParams, t: number): Point => {
	let rx = Math.abs(a.rx);
	let ry = Math.abs(a.ry);
	const phi = mod(a.xAxisRotation, 360) * (Math.PI / 180);
	if (a.x0 === a.x1 && a.y0 === a.y1) return { x: a.x0, y: a.y0 };
	// A zero radius makes the arc a straight line (SVG spec), walked linearly.
	if (rx === 0 || ry === 0) {
		return { x: a.x0 + (a.x1 - a.x0) * t, y: a.y0 + (a.y1 - a.y0) * t };
	}
	const dx = (a.x0 - a.x1) / 2;
	const dy = (a.y0 - a.y1) / 2;
	const px = Math.cos(phi) * dx + Math.sin(phi) * dy;
	const py = -Math.sin(phi) * dx + Math.cos(phi) * dy;
	const radiiCheck = px ** 2 / rx ** 2 + py ** 2 / ry ** 2;
	if (radiiCheck > 1) {
		rx = Math.sqrt(radiiCheck) * rx;
		ry = Math.sqrt(radiiCheck) * ry;
	}
	const numerator = rx ** 2 * ry ** 2 - rx ** 2 * py ** 2 - ry ** 2 * px ** 2;
	const denominator = rx ** 2 * py ** 2 + ry ** 2 * px ** 2;
	let radicand = numerator / denominator;
	radicand = Math.max(0, radicand);
	const coef = (a.largeArc !== a.sweep ? 1 : -1) * Math.sqrt(radicand);
	const tcx = coef * ((rx * py) / ry);
	const tcy = coef * (-(ry * px) / rx);
	const cx = Math.cos(phi) * tcx - Math.sin(phi) * tcy + (a.x0 + a.x1) / 2;
	const cy = Math.sin(phi) * tcx + Math.cos(phi) * tcy + (a.y0 + a.y1) / 2;
	const start = { x: (px - tcx) / rx, y: (py - tcy) / ry };
	const startAngle = angleBetween({ x: 1, y: 0 }, start);
	const end = { x: (-px - tcx) / rx, y: (-py - tcy) / ry };
	let sweepAngle = angleBetween(start, end);
	if (!a.sweep && sweepAngle > 0) sweepAngle -= 2 * Math.PI;
	else if (a.sweep && sweepAngle < 0) sweepAngle += 2 * Math.PI;
	sweepAngle %= 2 * Math.PI;
	const angle = startAngle + sweepAngle * t;
	const ex = rx * Math.cos(angle);
	const ey = ry * Math.sin(angle);
	return {
		x: Math.cos(phi) * ex - Math.sin(phi) * ey + cx,
		y: Math.sin(phi) * ex + Math.cos(phi) * ey + cy,
	};
};

const ARC_RESOLUTION = 300;
const ARC_TANGENT_STEP = 0.05;

const distance = (p0: Point, p1: Point): number =>
	Math.sqrt((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2);

/** An elliptical arc segment, measured as a 300-step polyline. */
export const arcSegment = (a: ArcParams): Segment => {
	let length = 0;
	let previous = pointOnArc(a, 0);
	for (let i = 0; i < ARC_RESOLUTION; i++) {
		const next = pointOnArc(a, Math.min(Math.max(i * (1 / ARC_RESOLUTION), 0), 1));
		length += distance(previous, next);
		previous = next;
	}
	length += distance(previous, pointOnArc(a, 1));

	const pointAt = (pos: number): Point => {
		const clamped = pos < 0 ? 0 : Math.min(pos, length);
		return pointOnArc(a, clamped / length);
	};
	return {
		length,
		isArc: true,
		pointAt,
		tangentAt: (pos) => {
			const clamped = pos < 0 ? 0 : Math.min(pos, length);
			const p1 = pointAt(clamped);
			const forward = clamped < length - ARC_TANGENT_STEP;
			const p2 = pointAt(forward ? clamped + ARC_TANGENT_STEP : clamped - ARC_TANGENT_STEP);
			const xDist = p2.x - p1.x;
			const yDist = p2.y - p1.y;
			const dist = Math.sqrt(xDist ** 2 + yDist ** 2);
			return forward
				? { x: -xDist / dist, y: -yDist / dist }
				: { x: xDist / dist, y: yDist / dist };
		},
	};
};
