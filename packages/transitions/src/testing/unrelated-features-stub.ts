// Stand-in for @remotion/shapes, @remotion/paths and @remotion/noise when bundling
// fixtures/features for the transitions golden test: the Transitions composition does not use
// them, but Root.tsx imports them for the other compositions of the fixture. Never rendered.
const unused = (): never => {
	throw new Error("unrelated feature stub: only the transitions composition may be rendered");
};
export const Circle = unused;
export const Ellipse = unused;
export const Pie = unused;
export const Polygon = unused;
export const Rect = unused;
export const Star = unused;
export const Triangle = unused;
export const evolvePath = unused;
export const interpolatePath = unused;
export const noise2D = unused;
