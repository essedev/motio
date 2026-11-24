import { AbsoluteFill, Img, staticFile } from "@motiojs/motio";
import { fontFamily } from "./fonts";
import type { IntroProps } from "./Intro";

// A still is a composition of one frame: no animation, just layout.
export const Thumbnail = ({ title, subtitle }: IntroProps) => (
	<AbsoluteFill
		style={{
			backgroundColor: "#101820",
			flexDirection: "row",
			justifyContent: "center",
			alignItems: "center",
			gap: 56,
			fontFamily,
		}}
	>
		<Img src={staticFile("logo.svg")} style={{ width: 240, height: 240 }} />
		<div>
			<h1 style={{ color: "white", fontSize: 88, fontWeight: 700, margin: 0 }}>{title}</h1>
			<p style={{ color: "#ffb000", fontSize: 40, margin: "16px 0 0" }}>{subtitle}</p>
		</div>
	</AbsoluteFill>
);
