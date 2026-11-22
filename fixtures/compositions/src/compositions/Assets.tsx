import { useEffect, useState } from "react";
import {
	AbsoluteFill,
	continueRender,
	delayRender,
	Img,
	staticFile,
	useCurrentFrame,
} from "remotion";
import { fontFamily } from "../fonts";

type Data = { title: string; values: number[] };

/** Img with staticFile, data fetched under delayRender in an effect, CSS gradients and shadows. */
export const Assets: React.FC = () => {
	const frame = useCurrentFrame();
	const [handle] = useState(() => delayRender("Fetching data.json"));
	const [data, setData] = useState<Data | null>(null);
	useEffect(() => {
		fetch(staticFile("data.json"))
			.then((r) => r.json())
			.then((d: Data) => {
				setData(d);
				continueRender(handle);
			});
	}, [handle]);
	return (
		<AbsoluteFill style={{ background: "linear-gradient(135deg, #0f172a, #334155)", fontFamily }}>
			<Img
				src={staticFile("photo.png")}
				style={{
					position: "absolute",
					left: 30,
					top: 30,
					width: 280,
					borderRadius: 12,
					boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
					transform: `rotate(${frame * 0.5}deg)`,
				}}
			/>
			<div
				style={{
					position: "absolute",
					left: 340,
					top: 40,
					color: "white",
					fontSize: 24,
					fontWeight: 700,
				}}
			>
				{data?.title}
			</div>
			{data?.values.map((v, i) => (
				<div
					key={`bar-${String(i)}`}
					style={{
						position: "absolute",
						left: 340 + i * 50,
						bottom: 40,
						width: 36,
						height: v * 20 + frame,
						background: "#38bdf8",
					}}
				/>
			))}
		</AbsoluteFill>
	);
};
