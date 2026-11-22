import type { ReactNode } from "react";
import { type MakeArrowProps, makeArrow } from "./make-arrow.js";
import { type MakeCalloutProps, makeCallout } from "./make-callout.js";
import { type MakeCircleProps, makeCircle } from "./make-circle.js";
import { type MakeEllipseProps, makeEllipse } from "./make-ellipse.js";
import { type MakeHeartProps, makeHeart } from "./make-heart.js";
import { type MakePieProps, makePie } from "./make-pie.js";
import { type MakePolygonProps, makePolygon } from "./make-polygon.js";
import { type MakeRectProps, makeRect } from "./make-rect.js";
import { type MakeSparkProps, makeSpark } from "./make-spark.js";
import { type MakeStarProps, makeStar } from "./make-star.js";
import { type MakeTriangleProps, makeTriangle } from "./make-triangle.js";
import { type AllShapesProps, RenderSvg } from "./render-svg.js";

/** Props of `<Rect>`. */
export type RectProps = MakeRectProps & AllShapesProps;
/** Renders a rectangle in an `<svg>`, compatible with Remotion's `<Rect>`. */
export const Rect = ({
	width,
	height,
	cornerRadius,
	edgeRoundness,
	...props
}: RectProps): ReactNode => (
	<RenderSvg
		shape={makeRect({
			width,
			height,
			...(cornerRadius === undefined ? {} : { cornerRadius }),
			...(edgeRoundness === undefined ? {} : { edgeRoundness }),
		})}
		props={props}
	/>
);

/** Props of `<Circle>`. */
export type CircleProps = MakeCircleProps & AllShapesProps;
/** Renders a circle in an `<svg>`, compatible with Remotion's `<Circle>`. */
export const Circle = ({ radius, ...props }: CircleProps): ReactNode => (
	<RenderSvg shape={makeCircle({ radius })} props={props} />
);

/** Props of `<Ellipse>`. */
export type EllipseProps = MakeEllipseProps & AllShapesProps;
/** Renders an ellipse in an `<svg>`, compatible with Remotion's `<Ellipse>`. */
export const Ellipse = ({ rx, ry, ...props }: EllipseProps): ReactNode => (
	<RenderSvg shape={makeEllipse({ rx, ry })} props={props} />
);

/** Props of `<Triangle>`. */
export type TriangleProps = MakeTriangleProps & AllShapesProps;
/** Renders an equilateral triangle in an `<svg>`, compatible with Remotion's `<Triangle>`. */
export const Triangle = ({
	length,
	direction,
	cornerRadius,
	edgeRoundness,
	...props
}: TriangleProps): ReactNode => (
	<RenderSvg
		shape={makeTriangle({
			length,
			direction,
			...(cornerRadius === undefined ? {} : { cornerRadius }),
			...(edgeRoundness === undefined ? {} : { edgeRoundness }),
		})}
		props={props}
	/>
);

/** Props of `<Star>`. */
export type StarProps = MakeStarProps & AllShapesProps;
/** Renders a star in an `<svg>`, compatible with Remotion's `<Star>`. */
export const Star = ({
	points,
	innerRadius,
	outerRadius,
	cornerRadius,
	edgeRoundness,
	...props
}: StarProps): ReactNode => (
	<RenderSvg
		shape={makeStar({
			points,
			innerRadius,
			outerRadius,
			...(cornerRadius === undefined ? {} : { cornerRadius }),
			...(edgeRoundness === undefined ? {} : { edgeRoundness }),
		})}
		props={props}
	/>
);

/** Props of `<Polygon>`. */
export type PolygonProps = MakePolygonProps & AllShapesProps;
/** Renders a regular polygon in an `<svg>`, compatible with Remotion's `<Polygon>`. */
export const Polygon = ({
	points,
	radius,
	cornerRadius,
	edgeRoundness,
	...props
}: PolygonProps): ReactNode => (
	<RenderSvg
		shape={makePolygon({
			points,
			radius,
			...(cornerRadius === undefined ? {} : { cornerRadius }),
			...(edgeRoundness === undefined ? {} : { edgeRoundness }),
		})}
		props={props}
	/>
);

/** Props of `<Pie>`. */
export type PieProps = MakePieProps & AllShapesProps;
/** Renders a pie slice in an `<svg>`, compatible with Remotion's `<Pie>`. */
export const Pie = ({
	radius,
	progress,
	closePath,
	counterClockwise,
	rotation,
	...props
}: PieProps): ReactNode => (
	<RenderSvg
		shape={makePie({
			radius,
			progress,
			...(closePath === undefined ? {} : { closePath }),
			...(counterClockwise === undefined ? {} : { counterClockwise }),
			...(rotation === undefined ? {} : { rotation }),
		})}
		props={props}
	/>
);

/** Props of `<Heart>`. */
export type HeartProps = MakeHeartProps & AllShapesProps;
/** Renders a heart in an `<svg>`, compatible with Remotion's `<Heart>`. */
export const Heart = ({
	height,
	aspectRatio,
	bottomRoundnessAdjustment,
	depthAdjustment,
	...props
}: HeartProps): ReactNode => (
	<RenderSvg
		shape={makeHeart({
			height,
			...(aspectRatio === undefined ? {} : { aspectRatio }),
			...(bottomRoundnessAdjustment === undefined ? {} : { bottomRoundnessAdjustment }),
			...(depthAdjustment === undefined ? {} : { depthAdjustment }),
		})}
		props={props}
	/>
);

/** Props of `<Arrow>`. */
export type ArrowProps = MakeArrowProps & AllShapesProps;
/** Renders an arrow in an `<svg>`, compatible with Remotion's `<Arrow>`. */
export const Arrow = ({
	length,
	headWidth,
	headLength,
	shaftWidth,
	direction,
	cornerRadius,
	...props
}: ArrowProps): ReactNode => (
	<RenderSvg
		shape={makeArrow({
			...(length === undefined ? {} : { length }),
			...(headWidth === undefined ? {} : { headWidth }),
			...(headLength === undefined ? {} : { headLength }),
			...(shaftWidth === undefined ? {} : { shaftWidth }),
			...(direction === undefined ? {} : { direction }),
			...(cornerRadius === undefined ? {} : { cornerRadius }),
		})}
		props={props}
	/>
);

/** Props of `<Callout>`. */
export type CalloutProps = MakeCalloutProps & AllShapesProps;
/** Renders a callout in an `<svg>`, compatible with Remotion's `<Callout>`. */
export const Callout = ({
	width,
	height,
	pointerLength,
	pointerBaseWidth,
	pointerPosition,
	pointerDirection,
	edgeRoundness,
	cornerRadius,
	...props
}: CalloutProps): ReactNode => (
	<RenderSvg
		shape={makeCallout({
			...(width === undefined ? {} : { width }),
			...(height === undefined ? {} : { height }),
			...(pointerLength === undefined ? {} : { pointerLength }),
			...(pointerBaseWidth === undefined ? {} : { pointerBaseWidth }),
			...(pointerPosition === undefined ? {} : { pointerPosition }),
			...(pointerDirection === undefined ? {} : { pointerDirection }),
			...(edgeRoundness === undefined ? {} : { edgeRoundness }),
			...(cornerRadius === undefined ? {} : { cornerRadius }),
		})}
		props={props}
	/>
);

/** Props of `<Spark>`. */
export type SparkProps = MakeSparkProps & AllShapesProps;
/** Renders a spark in an `<svg>`, compatible with Remotion's `<Spark>`. */
export const Spark = ({
	width,
	height,
	edgeRoundness,
	cornerRadius,
	...props
}: SparkProps): ReactNode => (
	<RenderSvg
		shape={makeSpark({
			width,
			height,
			...(edgeRoundness === undefined ? {} : { edgeRoundness }),
			...(cornerRadius === undefined ? {} : { cornerRadius }),
		})}
		props={props}
	/>
);
