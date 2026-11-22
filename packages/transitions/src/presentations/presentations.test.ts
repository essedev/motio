// Geometry of the presentations, checked against edges measured on the Remotion reference stills
// of fixtures/features (640x360): wipe at frame 60, flip at 80 and 85, clock wipe at 100 and 105,
// iris at 125.
import { describe, expect, it } from "vitest";
import { clockWipe, clockWipePath } from "./clock-wipe.js";
import { cube, cubeTransform } from "./cube.js";
import { fade } from "./fade.js";
import { flip, flipTransform } from "./flip.js";
import { iris, irisRadius } from "./iris.js";
import { none } from "./none.js";
import { pushCut, pushCutState } from "./push-cut.js";
import { slide, slideTransform } from "./slide.js";
import { wipe, wipeClipPath, wipePolygon } from "./wipe.js";

const W = 640;
const H = 360;

/** Screen x of the left and right edges of a scene turned by `deg` around Y, CSS perspective. */
function projectedEdges(deg: number, perspective = 1000): [number, number] {
	const a = (deg * Math.PI) / 180;
	const x = (side: -1 | 1) => {
		const px = side * (W / 2) * Math.cos(a);
		const pz = -side * (W / 2) * Math.sin(a);
		return W / 2 + (px * perspective) / (perspective - pz);
	};
	return [x(-1), x(1)];
}

function angleOf(transform: string): number {
	const match = /rotate[XY]\((-?[\d.]+)deg\)/.exec(transform);
	if (!match?.[1]) throw new Error(`no rotation in ${transform}`);
	return Number(match[1]);
}

describe("wipe()", () => {
	it("reveals a triangle from the top-left corner at 0.2 (edges at x=256, y=144 on frame 60)", () => {
		expect(wipeClipPath("from-top-left", 0.2)).toBe("polygon(0% 0%, 40% 0%, 0% 40%)");
		const [, top, left] = wipePolygon("from-top-left", 0.2);
		expect((top?.[0] ?? 0) * W).toBeCloseTo(256, 6);
		expect((left?.[1] ?? 0) * H).toBeCloseTo(144, 6);
	});

	it("covers the whole scene at the end in every direction", () => {
		for (const direction of [
			"from-left",
			"from-top-left",
			"from-top",
			"from-top-right",
			"from-right",
			"from-bottom-right",
			"from-bottom",
			"from-bottom-left",
		] as const) {
			const pts = wipePolygon(direction, 1);
			const xs = pts.map(([x]) => x);
			const ys = pts.map(([, y]) => y);
			expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([
				0, 1, 0, 1,
			]);
		}
		expect(wipeClipPath("from-left", 0.25)).toBe("polygon(0% 0%, 25% 0%, 25% 100%, 0% 100%)");
		expect(wipeClipPath("from-bottom-right", 0.75)).toBe(
			"polygon(100% 100%, 0% 100%, 0% 50%, 50% 0%, 100% 0%)",
		);
	});

	it("validates the direction", () => {
		expect(() => wipe({ direction: "diagonal" as never })).toThrow(/"direction" must be one of/);
		expect(wipe().props).toEqual({});
	});
});

describe("flip()", () => {
	it("turns the exiting scene by 36 degrees at 0.2 (edges at x=1 and 538 on frame 80)", () => {
		const angle = angleOf(flipTransform("from-left", "exiting", 0.2));
		expect(angle).toBeCloseTo(36, 9);
		const [left, right] = projectedEdges(angle);
		expect(left).toBeCloseTo(1, 0);
		expect(right).toBeCloseTo(538, 0);
	});

	it("brings the entering scene from -180 degrees (edges at x=170 and 574 at 0.7 on frame 85)", () => {
		const angle = angleOf(flipTransform("from-left", "entering", 0.7));
		expect(angle).toBeCloseTo(-54, 9);
		const [left, right] = projectedEdges(angle);
		expect(Math.abs(left - 170.5)).toBeLessThan(1);
		expect(Math.abs(right - 574)).toBeLessThan(1);
	});

	it("mirrors the rotation for the other directions", () => {
		expect(flipTransform("from-right", "exiting", 0.5)).toBe("rotateY(-90deg)");
		expect(flipTransform("from-top", "entering", 0)).toBe("rotateX(180deg)");
		expect(flipTransform("from-bottom", "entering", 1)).toBe("rotateX(0deg)");
		expect(() => flip({ direction: "up" as never })).toThrow(/"direction"/);
	});
});

describe("clockWipe()", () => {
	/** Where the moving edge of the sector crosses the frame border. */
	function edgeCrossing(progress: number): { x: number; y: number } {
		const match = / (-?[\d.]+) (-?[\d.]+) Z$/.exec(clockWipePath(W, H, progress));
		const ex = Number(match?.[1]);
		const ey = Number(match?.[2]);
		const dx = ex - W / 2;
		const dy = ey - H / 2;
		const t = Math.min(
			dx === 0 ? Number.POSITIVE_INFINITY : Math.abs(W / 2 / dx),
			dy === 0 ? Number.POSITIVE_INFINITY : Math.abs(H / 2 / dy),
		);
		return { x: W / 2 + dx * t, y: H / 2 + dy * t };
	}

	it("starts at 12 o'clock and sweeps clockwise (right border at y=76.5 at 0.2, frame 100)", () => {
		expect(clockWipePath(W, H, 0.2)).toMatch(/^M 320 180 L 320 -?\d+ A /);
		const { x, y } = edgeCrossing(0.2);
		expect(x).toBeCloseTo(640, 6);
		expect(Math.abs(y - 76.5)).toBeLessThan(1);
	});

	it("passes 6 o'clock past half way (left border at y=283.5 at 0.7, frame 105)", () => {
		expect(clockWipePath(W, H, 0.7)).toContain(" 0 1 1 ");
		const { x, y } = edgeCrossing(0.7);
		expect(x).toBeCloseTo(0, 6);
		expect(Math.abs(y - 283.5)).toBeLessThan(1);
	});

	it("needs the size of the video", () => {
		expect(() => clockWipe({ width: 0, height: 360 })).toThrow(/"width" must be a positive number/);
	});
});

describe("iris()", () => {
	it("grows to half the diagonal (radius 257 at 0.7 on frame 125)", () => {
		expect(irisRadius(W, H, 0.7)).toBeCloseTo(257, 0);
		expect(irisRadius(W, H, 1)).toBeCloseTo(Math.hypot(W, H) / 2, 9);
		expect(() => iris({ width: 640, height: Number.NaN })).toThrow(/"height"/);
	});
});

describe("slide()", () => {
	it("pushes the exiting scene out as the entering one comes in", () => {
		expect(slideTransform("from-left", "entering", 0)).toBe("translateX(-100%)");
		expect(slideTransform("from-left", "exiting", 0.25)).toBe("translateX(25%)");
		expect(slideTransform("from-right", "entering", 0.25)).toBe("translateX(75%)");
		expect(slideTransform("from-right", "exiting", 1)).toBe("translateX(-100%)");
		expect(slideTransform("from-top", "entering", 0.5)).toBe("translateY(-50%)");
		expect(slideTransform("from-bottom", "exiting", 0.5)).toBe("translateY(-50%)");
		expect(() => slide({ direction: "from-north" as never })).toThrow(/"direction"/);
	});
});

describe("cube()", () => {
	it("turns both faces by 90 degrees around the centre of the cube", () => {
		expect(cubeTransform("from-left", "exiting", 0, 320)).toBe(
			"translateZ(-320px) rotateY(0deg) translateZ(320px)",
		);
		expect(cubeTransform("from-left", "exiting", 1, 320)).toContain("rotateY(90deg)");
		expect(cubeTransform("from-left", "entering", 0, 320)).toContain("rotateY(-90deg)");
		expect(cubeTransform("from-right", "entering", 0.5, 320)).toContain("rotateY(45deg)");
		expect(cubeTransform("from-top", "entering", 0, 180)).toContain("rotateX(90deg)");
		expect(cubeTransform("from-bottom", "exiting", 1, 180)).toContain("rotateX(90deg)");
	});

	it("requires a direction", () => {
		expect(() => cube({} as never)).toThrow(/"direction" is required/);
	});
});

describe("pushCut()", () => {
	it("cuts at 5/11 with a punch-in on both scenes and a flash", () => {
		const d = 11;
		expect(pushCutState({}, "exiting", 0, d)).toEqual({ visible: true, scale: 1, flash: 0 });
		expect(pushCutState({}, "exiting", 5 / 11, d).visible).toBe(false);
		expect(pushCutState({}, "exiting", 4.99 / 11, d).scale).toBeCloseTo(1.04, 3);
		expect(pushCutState({}, "entering", 4 / 11, d).visible).toBe(false);
		const atCut = pushCutState({}, "entering", 5 / 11, d);
		expect(atCut).toMatchObject({ visible: true, scale: 1.04 });
		expect(atCut.flash).toBeCloseTo(0.2, 9);
		expect(pushCutState({}, "entering", 6 / 11, d).flash).toBeCloseTo(0.1, 9);
		expect(pushCutState({}, "entering", 7 / 11, d).flash).toBe(0);
		expect(pushCutState({}, "entering", 1, d).scale).toBeCloseTo(1.07, 9);
	});

	it("validates its options", () => {
		expect(() => pushCut({ cutProgress: 2 })).toThrow(/"cutProgress" must be a number from 0 to 1/);
		expect(() => pushCut({ flashFrames: -1 })).toThrow(/"flashFrames"/);
	});
});

describe("fade() and none()", () => {
	it("keep their options as passed props", () => {
		expect(fade({ shouldFadeOutExitingScene: true }).props).toEqual({
			shouldFadeOutExitingScene: true,
		});
		expect(none().props).toEqual({});
	});
});
