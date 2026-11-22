import {
	AbsoluteFill,
	Freeze,
	Loop,
	Sequence,
	Series,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";
import { fontFamily } from "../fonts";

const Label: React.FC<{ name: string; color: string; top: number }> = ({ name, color, top }) => {
	const frame = useCurrentFrame();
	const { durationInFrames } = useVideoConfig();
	return (
		<div
			style={{
				position: "absolute",
				top,
				left: 20,
				height: 34,
				width: 40 + frame * 6,
				background: color,
				color: "white",
				fontFamily,
				fontSize: 20,
				lineHeight: "34px",
				paddingLeft: 8,
				whiteSpace: "nowrap",
			}}
		>
			{`${name} ${frame}/${durationInFrames}`}
		</div>
	);
};

/** Nested Sequence offsets, Series with offset, Loop and Freeze: each bar shows its local frame. */
export const Timeline: React.FC = () => (
	<AbsoluteFill style={{ backgroundColor: "#f4f1ea" }}>
		<Label name="root" color="#333" top={10} />
		<Sequence from={10} durationInFrames={40} name="seq10">
			<Label name="seq10" color="#c0392b" top={54} />
			<Sequence from={5}>
				<Label name="nested+5" color="#e67e22" top={98} />
			</Sequence>
		</Sequence>
		<Sequence from={-5} layout="none">
			<Label name="neg5" color="#8e44ad" top={142} />
		</Sequence>
		<Series>
			<Series.Sequence durationInFrames={15}>
				<Label name="s1" color="#16a085" top={186} />
			</Series.Sequence>
			<Series.Sequence durationInFrames={20} offset={5}>
				<Label name="s2" color="#2980b9" top={186} />
			</Series.Sequence>
		</Series>
		<Loop durationInFrames={12}>
			<Label name="loop12" color="#27ae60" top={230} />
		</Loop>
		<Freeze frame={7}>
			<Label name="freeze7" color="#7f8c8d" top={274} />
		</Freeze>
	</AbsoluteFill>
);
