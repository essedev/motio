// truck.riv and look.riv are example files of the Rive web runtime (rive-app/rive-wasm, MIT,
// Copyright (c) 2020-2021 Rive); see the repository's NOTICE.
import { RemotionRiveCanvas } from "@remotion/rive";
import { AbsoluteFill, Composition, Sequence, staticFile } from "remotion";

const size = { width: 640, height: 360, fps: 30, durationInFrames: 150 } as const;
const truck = staticFile("truck.riv");
const look = staticFile("look.riv");

const Background: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<AbsoluteFill style={{ backgroundColor: "#eef1f6" }}>{children}</AbsoluteFill>
);

// The default artboard and animation ("bounce", played once), and the looping "idle" over it.
const Truck: React.FC = () => (
	<Background>
		<RemotionRiveCanvas src={truck} />
	</Background>
);

// Fit and alignment, an animation inside its work area, the inherited <Sequence> props.
const Options: React.FC = () => (
	<Background>
		<AbsoluteFill style={{ flexDirection: "row", flexWrap: "wrap" }}>
			<RemotionRiveCanvas
				src={truck}
				animation="idle"
				fit="cover"
				alignment="top-left"
				playbackRate={1.5}
				style={{ width: 320, height: 180 }}
			/>
			<RemotionRiveCanvas
				src={truck}
				animation={2}
				fit="fill"
				style={{ width: 320, height: 180 }}
			/>
			<RemotionRiveCanvas
				src={truck}
				animation="idle"
				fit="none"
				alignment="bottom-right"
				from={20}
				trimBefore={15}
				style={{ width: 320, height: 180, borderRadius: 24 }}
			/>
			<RemotionRiveCanvas
				src={truck}
				animation="curves"
				fit="scale-down"
				alignment="center-left"
				loop
				durationInFrames={40}
				cropRight={0.25}
				style={{ width: 320, height: 180 }}
			/>
		</AbsoluteFill>
	</Background>
);

// Several artboards of one file, by name and by index, inside a <Sequence> of its own size.
const Artboards: React.FC = () => (
	<Background>
		<RemotionRiveCanvas src={look} artboard="All Avatars" animation="idle" />
		<Sequence from={30} width={200} height={200}>
			<RemotionRiveCanvas src={look} artboard={1} animation="happy" alignment="bottom-center" />
		</Sequence>
	</Background>
);

export const Root: React.FC = () => (
	<>
		<Composition id="rive-truck" component={Truck} {...size} />
		<Composition id="rive-options" component={Options} {...size} />
		<Composition id="rive-artboards" component={Artboards} {...size} />
	</>
);
