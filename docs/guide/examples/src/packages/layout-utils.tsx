import { fitText } from "@motiojs/layout-utils";
import { AbsoluteFill } from "@motiojs/motio";

// region: fit
export const Headline = ({ text }: { text: string }) => {
	// The font size at which the text is exactly 1000 px wide, measured with the loaded font.
	const { fontSize } = fitText({ text, withinWidth: 1000, fontFamily: "Inter", fontWeight: "700" });
	return (
		<AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
			<h1 style={{ fontFamily: "Inter", fontWeight: 700, fontSize, whiteSpace: "nowrap" }}>
				{text}
			</h1>
		</AbsoluteFill>
	);
};
// endregion
