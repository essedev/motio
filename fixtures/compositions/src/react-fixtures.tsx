// React fixtures for the frame protocol (ROADMAP M1): each composition reaches its frame number
// through a different asynchronous React path and draws it as a frame stamp, which the
// integration test decodes from every captured frame. Not part of the Remotion oracle root.
import { frameStampBlocks } from "@motiojs/testing/frame-stamp";
import { lazy, useDeferredValue, useEffect, useState } from "react";
import {
	AbsoluteFill,
	Composition,
	continueRender,
	delayRender,
	registerRoot,
	useCurrentFrame,
} from "remotion";

/** Draws `value` as a frame stamp on black; nothing while the value is unknown. */
const Stamp: React.FC<{ value: number | null }> = ({ value }) => (
	<AbsoluteFill style={{ backgroundColor: "black" }}>
		{value === null || value < 0
			? null
			: frameStampBlocks(value, { x: 16, y: 8, blockSize: 16 }).map((b) => (
					<div
						key={b.x}
						style={{
							position: "absolute",
							left: b.x,
							top: b.y,
							width: b.size,
							height: b.size,
							backgroundColor: b.on ? "white" : "black",
						}}
					/>
				))}
	</AbsoluteFill>
);

/** delayRender in an effect: the value arrives on a later macrotask. */
const DelayInEffect: React.FC = () => {
	const frame = useCurrentFrame();
	const [value, setValue] = useState<number | null>(null);
	useEffect(() => {
		const handle = delayRender(`Loading frame ${frame}`);
		const timer = setTimeout(() => {
			setValue(frame);
			continueRender(handle);
		}, 15);
		return () => {
			clearTimeout(timer);
			continueRender(handle);
		};
	}, [frame]);
	return <Stamp value={value} />;
};

/** setState in an effect: the value is set by a passive effect after the render. */
const StateInEffect: React.FC = () => {
	const frame = useCurrentFrame();
	const [value, setValue] = useState(-1);
	useEffect(() => setValue(frame), [frame]);
	return <Stamp value={value} />;
};

/** useDeferredValue: the value catches up on a non-sync lane. */
const DeferredValue: React.FC = () => {
	const deferred = useDeferredValue(useCurrentFrame());
	return <Stamp value={deferred} />;
};

/** React.lazy under the root Suspense boundary: the stamp component loads asynchronously. */
const LazyStamp = lazy(
	() =>
		new Promise<{ default: React.FC<{ value: number }> }>((resolve) => {
			setTimeout(() => resolve({ default: Stamp }), 50);
		}),
);
const LazySuspense: React.FC = () => <LazyStamp value={useCurrentFrame()} />;

const size = { width: 448, height: 32, fps: 30, durationInFrames: 90 } as const;

export const ReactFixturesRoot: React.FC = () => (
	<>
		<Composition id="delay-in-effect" component={DelayInEffect} {...size} />
		<Composition id="state-in-effect" component={StateInEffect} {...size} />
		<Composition id="deferred-value" component={DeferredValue} {...size} />
		<Composition id="lazy-suspense" component={LazySuspense} {...size} />
	</>
);

registerRoot(ReactFixturesRoot);
