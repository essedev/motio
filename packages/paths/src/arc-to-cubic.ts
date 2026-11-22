// Converts an SVG elliptical arc to cubic Bézier curves.
//
// Ported from svgpath's lib/a2c.js (https://github.com/fontello/svgpath):
//
// (The MIT License)
//
// Copyright (C) 2013-2015 by Vitaly Puzrin
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//
// Changes: TypeScript types, named parameters, curves returned without the
// start point. The arithmetic is unchanged: it reproduces Remotion's output
// bit for bit (checked against the oracle).

const TAU = Math.PI * 2;

/** A cubic segment: two control points and the end point. */
export type CubicSegment = [
	cp1x: number,
	cp1y: number,
	cp2x: number,
	cp2y: number,
	x: number,
	y: number,
];

// Angle between two unit vectors (radii of a circular arc, so no length
// normalisation is needed).
const unitVectorAngle = (ux: number, uy: number, vx: number, vy: number): number => {
	const sign = ux * vy - uy * vx < 0 ? -1 : 1;
	let dot = ux * vx + uy * vy;
	// Rounding errors, such as -1.0000000000000002, would break acos.
	if (dot > 1) dot = 1;
	if (dot < -1) dot = -1;
	return sign * Math.acos(dot);
};

// Endpoint to center parameterisation, see
// https://www.w3.org/TR/SVG11/implnote.html#ArcImplementationNotes
const getArcCenter = (
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	largeArc: boolean,
	sweep: boolean,
	rx: number,
	ry: number,
	sinPhi: number,
	cosPhi: number,
): [cx: number, cy: number, theta1: number, deltaTheta: number] => {
	// Move the origin to the midpoint of the endpoints and rotate the ellipse
	// axes onto the coordinate axes.
	const x1p = (cosPhi * (x1 - x2)) / 2 + (sinPhi * (y1 - y2)) / 2;
	const y1p = (-sinPhi * (x1 - x2)) / 2 + (cosPhi * (y1 - y2)) / 2;
	const rxSq = rx * rx;
	const rySq = ry * ry;
	const x1pSq = x1p * x1p;
	const y1pSq = y1p * y1p;

	// Centre in the rotated system.
	let radicant = rxSq * rySq - rxSq * y1pSq - rySq * x1pSq;
	// Rounding errors can make it slightly negative, such as -1.3877787807814457e-17.
	if (radicant < 0) radicant = 0;
	radicant /= rxSq * y1pSq + rySq * x1pSq;
	radicant = Math.sqrt(radicant) * (largeArc === sweep ? -1 : 1);
	const cxp = ((radicant * rx) / ry) * y1p;
	const cyp = ((radicant * -ry) / rx) * x1p;

	// Back to the original system.
	const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
	const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

	const v1x = (x1p - cxp) / rx;
	const v1y = (y1p - cyp) / ry;
	const v2x = (-x1p - cxp) / rx;
	const v2y = (-y1p - cyp) / ry;
	const theta1 = unitVectorAngle(1, 0, v1x, v1y);
	let deltaTheta = unitVectorAngle(v1x, v1y, v2x, v2y);
	if (!sweep && deltaTheta > 0) deltaTheta -= TAU;
	if (sweep && deltaTheta < 0) deltaTheta += TAU;
	return [cx, cy, theta1, deltaTheta];
};

// One unit-circle arc segment as a cubic, see
// https://math.stackexchange.com/questions/873224
const approximateUnitArc = (theta1: number, deltaTheta: number): number[] => {
	const alpha = (4 / 3) * Math.tan(deltaTheta / 4);
	const x1 = Math.cos(theta1);
	const y1 = Math.sin(theta1);
	const x2 = Math.cos(theta1 + deltaTheta);
	const y2 = Math.sin(theta1 + deltaTheta);
	return [x1 - y1 * alpha, y1 + x1 * alpha, x2 + y2 * alpha, y2 - x2 * alpha, x2, y2];
};

/**
 * Cubic segments approximating the arc from (x1, y1) to (x2, y2), each
 * spanning at most a quarter turn. Returns no segments when the endpoints
 * coincide or a radius is zero (the SVG spec draws a line in that case).
 */
export const arcToCubic = ({
	x1,
	y1,
	x2,
	y2,
	largeArc,
	sweep,
	rx: rxIn,
	ry: ryIn,
	xAxisRotation,
}: {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	largeArc: boolean;
	sweep: boolean;
	rx: number;
	ry: number;
	xAxisRotation: number;
}): CubicSegment[] => {
	const sinPhi = Math.sin((xAxisRotation * TAU) / 360);
	const cosPhi = Math.cos((xAxisRotation * TAU) / 360);
	const x1p = (cosPhi * (x1 - x2)) / 2 + (sinPhi * (y1 - y2)) / 2;
	const y1p = (-sinPhi * (x1 - x2)) / 2 + (cosPhi * (y1 - y2)) / 2;
	if (x1p === 0 && y1p === 0) return [];
	if (rxIn === 0 || ryIn === 0) return [];

	// Scale up radii that are too small to span the endpoints.
	let rx = Math.abs(rxIn);
	let ry = Math.abs(ryIn);
	const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
	if (lambda > 1) {
		rx *= Math.sqrt(lambda);
		ry *= Math.sqrt(lambda);
	}

	const [cx, cy, theta1Start, deltaThetaTotal] = getArcCenter(
		x1,
		y1,
		x2,
		y2,
		largeArc,
		sweep,
		rx,
		ry,
		sinPhi,
		cosPhi,
	);
	const segments = Math.max(Math.ceil(Math.abs(deltaThetaTotal) / (TAU / 4)), 1);
	const deltaTheta = deltaThetaTotal / segments;
	const result: CubicSegment[] = [];
	let theta1 = theta1Start;
	for (let i = 0; i < segments; i++) {
		const curve = approximateUnitArc(theta1, deltaTheta);
		theta1 += deltaTheta;
		// Unit circle back to the ellipse: scale, rotate, translate.
		for (let j = 0; j < curve.length; j += 2) {
			const x = (curve[j] as number) * rx;
			const y = (curve[j + 1] as number) * ry;
			curve[j] = cosPhi * x - sinPhi * y + cx;
			curve[j + 1] = sinPhi * x + cosPhi * y + cy;
		}
		result.push(curve as CubicSegment);
	}
	return result;
};
