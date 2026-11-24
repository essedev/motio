import { SANS } from "./fonts";

type PillProps = { children: React.ReactNode; fill: string; ink: string; size: number };

/** A rounded label on a flat field: status and licence. */
export const Pill = ({ children, fill, ink, size }: PillProps) => (
	<span
		style={{
			display: "inline-block",
			padding: `${size * 0.55}px ${size * 0.82}px`,
			borderRadius: 999,
			background: fill,
			color: ink,
			fontFamily: SANS,
			fontWeight: 600,
			fontSize: size,
			lineHeight: 1,
			whiteSpace: "nowrap",
		}}
	>
		{children}
	</span>
);
