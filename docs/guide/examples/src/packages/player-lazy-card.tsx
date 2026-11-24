// The module a lazy Player loads: the composition component as its default export.
import { AbsoluteFill } from "@motiojs/motio";

const LazyCard = () => (
	<AbsoluteFill
		style={{ backgroundColor: "#3a1f5d", justifyContent: "center", alignItems: "center" }}
	>
		<h1 style={{ color: "white", fontSize: 120 }}>Loaded on demand</h1>
	</AbsoluteFill>
);

export default LazyCard;
