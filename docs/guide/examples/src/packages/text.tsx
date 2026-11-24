import { measureText } from "@motiojs/layout-utils";
import { AbsoluteFill } from "@motiojs/motio";
import { makeTextBackground, TextBackground } from "@motiojs/text";
import { createRoundedTextBox } from "@motiojs/text/rounded-text-box";

// region: component
export const Caption = () => (
	<AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
		<TextBackground
			align="center"
			cornerRadius={18}
			paddingX={24}
			paddingY={6}
			fill="white"
			border={{ width: 3, color: "black" }}
			shadow={{ offsetY: 6, blur: 16, color: "rgba(0, 0, 0, 0.35)" }}
			style={{ maxWidth: 900, fontFamily: "Inter", fontSize: 64, lineHeight: 1.3, color: "black" }}
		>
			Corners follow every line, even the short ones
		</TextBackground>
	</AbsoluteFill>
);
// endregion

// region: shape
const font = { fontFamily: "Inter", fontSize: 64, fontWeight: "700" };
const lines = ["Hello", "from Motio"].map((text) => ({
	width: measureText({ text, ...font }).width,
	height: 64 * 1.3,
}));
const {
	path,
	width,
	height,
	lines: boxes,
} = makeTextBackground({
	lines,
	align: "center",
	cornerRadius: 16,
	paddingX: 20,
	paddingY: 8,
	join: "round",
});
// <svg width={width} height={height}><path d={path} /></svg>, each line's text at boxes[i].x, boxes[i].y
// endregion

// region: rounded-text-box
const { d, boundingBox, instructions } = createRoundedTextBox({
	textMeasurements: [
		{ width: 300, height: 54 },
		{ width: 180, height: 54 },
	],
	textAlign: "center",
	horizontalPadding: 20,
	borderRadius: 20,
});
// endregion

export const all = [path, width, height, boxes, d, boundingBox, instructions];
