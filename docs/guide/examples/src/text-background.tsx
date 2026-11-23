import { measureText } from "@motiojs/layout-utils";
import { makeTextBackground, TextBackground } from "@motiojs/text";
import { AbsoluteFill, interpolate, useCurrentFrame } from "motio";

// region: component
export const Caption = ({ text }: { text: string }) => {
	const frame = useCurrentFrame();
	// The text appears word by word; the background follows the lines as they grow.
	const words = text.split(" ");
	const shown = Math.min(words.length, Math.floor(frame / 4) + 1);
	return (
		<AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 120 }}>
			<TextBackground
				align="center"
				cornerRadius={16}
				paddingX={24}
				paddingY={8}
				join="round"
				fill="#ffb000"
				border={{ width: 4, color: "#101820" }}
				shadow={{ offsetY: 8, blur: 20, color: "rgba(0, 0, 0, 0.4)" }}
				style={{
					maxWidth: 1000,
					fontFamily: "Inter",
					fontSize: 64,
					fontWeight: 700,
					lineHeight: 1.25,
					color: "#101820",
					opacity: interpolate(frame, [0, 6], [0, 1], { extrapolateRight: "clamp" }),
				}}
			>
				{words.slice(0, shown).join(" ")}
			</TextBackground>
		</AbsoluteFill>
	);
};
// endregion

// region: shape
export const Badge = () => {
	const fontSize = 48;
	const lineHeight = fontSize * 1.3;
	const texts = ["New", "this week"];
	// One entry per line: the width of its text and the height of its line box.
	const shape = makeTextBackground({
		lines: texts.map((text) => ({
			width: measureText({ text, fontFamily: "Inter", fontSize, fontWeight: "700" }).width,
			height: lineHeight,
		})),
		align: "left",
		cornerRadius: 12,
		paddingX: 18,
		paddingY: 6,
		join: "bevel",
	});
	return (
		<svg width={shape.width} height={shape.height} role="img" aria-label={texts.join(" ")}>
			<path d={shape.path} fill="#101820" />
			{shape.lines.map((line, i) => (
				<text
					key={texts[i]}
					x={line.x}
					y={line.y + line.height / 2}
					dominantBaseline="central"
					fill="white"
					style={{ fontFamily: "Inter", fontSize, fontWeight: 700 }}
				>
					{texts[i]}
				</text>
			))}
		</svg>
	);
};
// endregion
