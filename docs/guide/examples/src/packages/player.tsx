import { AbsoluteFill, interpolate, useCurrentFrame } from "@motiojs/motio";
import { Player, type PlayerRef, Thumbnail } from "@motiojs/player";
import { useEffect, useMemo, useRef, useState } from "react";

// region: card
// A composition component, the same one a render uses.
export const Card = ({ name }: { name: string }) => {
	const frame = useCurrentFrame();
	const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
	return (
		<AbsoluteFill
			style={{ backgroundColor: "#101820", justifyContent: "center", alignItems: "center" }}
		>
			<h1 style={{ color: "white", fontSize: 120, opacity }}>Hello, {name}</h1>
		</AbsoluteFill>
	);
};
// endregion

// region: player
export const CardPreview = ({ name }: { name: string }) => {
	// A new inputProps object restarts the composition's setup: keep it stable between renders.
	const inputProps = useMemo(() => ({ name }), [name]);
	return (
		<Player
			component={Card}
			inputProps={inputProps}
			durationInFrames={90}
			fps={30}
			compositionWidth={1920}
			compositionHeight={1080}
			// The composition is scaled down to fit the width; the height follows its aspect ratio.
			style={{ width: "100%" }}
			controls
			loop
		/>
	);
};
// endregion

// region: ref
export const ControlledPreview = () => {
	const player = useRef<PlayerRef>(null);
	const [frame, setFrame] = useState(0);

	useEffect(() => {
		const current = player.current;
		if (!current) return;
		const onFrame = ({ detail }: { detail: { frame: number } }) => setFrame(detail.frame);
		current.addEventListener("frameupdate", onFrame);
		return () => current.removeEventListener("frameupdate", onFrame);
	}, []);

	return (
		<>
			<Player
				ref={player}
				component={Card}
				inputProps={{ name: "Ada" }}
				durationInFrames={90}
				fps={30}
				compositionWidth={1920}
				compositionHeight={1080}
				style={{ width: 640 }}
			/>
			{/* Passing the click event lets the browser start audio, which needs a user gesture. */}
			<button type="button" onClick={(event) => player.current?.toggle(event)}>
				Play or pause
			</button>
			<button type="button" onClick={() => player.current?.seekTo(45)}>
				Go to frame 45
			</button>
			<p>Frame {frame}</p>
		</>
	);
};
// endregion

// region: thumbnail
// One frame, without controls or playback: for galleries and lists.
export const CardThumbnail = () => (
	<Thumbnail
		component={Card}
		inputProps={{ name: "Grace" }}
		frameToDisplay={60}
		durationInFrames={90}
		fps={30}
		compositionWidth={1920}
		compositionHeight={1080}
		style={{ width: 320 }}
	/>
);
// endregion

// region: lazy
// The composition's code is downloaded only when the player mounts. The loader is defined once,
// outside the component: a new function would load the module again.
const loadCard = () => import("./player-lazy-card");

export const LazyPreview = () => (
	<Player
		lazyComponent={loadCard}
		durationInFrames={90}
		fps={30}
		compositionWidth={1920}
		compositionHeight={1080}
		style={{ width: "100%" }}
		controls
	/>
);
// endregion
