import { AbsoluteFill } from "remotion";
import { fontFamily } from "../fonts";

/** A Still with typography and layout only. */
export const Poster: React.FC<{ headline: string }> = ({ headline }) => (
	<AbsoluteFill
		style={{
			backgroundColor: "#fafafa",
			padding: 40,
			fontFamily,
			display: "flex",
			flexDirection: "column",
			gap: 16,
		}}
	>
		<div style={{ fontSize: 48, fontWeight: 700, color: "#111", letterSpacing: -1 }}>
			{headline}
		</div>
		<div style={{ fontSize: 20, color: "#555", lineHeight: 1.5, maxWidth: 520 }}>
			Text layout, kerning and antialiasing come from Chrome. The quick brown fox jumps over the
			lazy dog 0123456789.
		</div>
		<div style={{ display: "flex", gap: 12 }}>
			{["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6"].map((c) => (
				<div
					key={c}
					style={{
						width: 60,
						height: 60,
						borderRadius: 30,
						background: c,
						border: "3px solid #111",
					}}
				/>
			))}
		</div>
	</AbsoluteFill>
);
