import { AbsoluteFill } from "@motiojs/motio";
import { Lockup } from "../brand/Lockup";
import { useLayout } from "../brand/layout";
import { PALETTE } from "../brand/tokens";

/** The lockup plays on Plum: the frames fan out, the letters rise. */
export const Intro = () => {
	const { tall } = useLayout();
	return (
		<AbsoluteFill
			style={{ background: PALETTE.plum, justifyContent: "center", alignItems: "center" }}
		>
			<Lockup size={tall ? 150 : 190} ink={PALETTE.mist} />
		</AbsoluteFill>
	);
};
