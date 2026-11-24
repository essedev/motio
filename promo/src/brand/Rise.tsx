import { useBrandSpring } from "./motion";

type RiseProps = { delay: number; children: React.ReactNode; style?: React.CSSProperties };

/** A line of type that rises into view from behind its own baseline, with the brand spring. */
export const Rise = ({ delay, children, style }: RiseProps) => {
	const rise = useBrandSpring(delay);
	return (
		<span
			style={{
				display: "block",
				overflow: "hidden",
				// Room for descenders and the overshoot, without moving the line.
				padding: "0.08em 0.04em 0.16em",
				margin: "-0.08em -0.04em -0.16em",
				...style,
			}}
		>
			<span style={{ display: "block", translate: `0 ${(1 - rise) * 115}%` }}>{children}</span>
		</span>
	);
};
