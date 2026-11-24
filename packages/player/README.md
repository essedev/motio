# @motiojs/player

Plays a [Motio](../../README.md) composition inside your own React app, in the browser, with no render: the same component a render captures, driven by the real clock. For previews in an editor, personalised videos on a page, or interactive versions of a video.

```bash
pnpm add @motiojs/player @motiojs/motio
```

## Player

<!-- example: ../../docs/guide/examples/src/packages/player.tsx#card -->
```tsx
import { AbsoluteFill, interpolate, useCurrentFrame } from "@motiojs/motio";

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
```

<!-- example: ../../docs/guide/examples/src/packages/player.tsx#player -->
```tsx
import { Player } from "@motiojs/player";
import { useMemo } from "react";

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
```

The composition's metadata is given to the Player directly: `durationInFrames`, `fps`, `compositionWidth` and `compositionHeight` are required, and `inputProps` are the component's props (typed from the component). There is no `<Composition>` and no `calculateMetadata()` here: compute the values before rendering the Player.

The composition is drawn at its own size and scaled to fit the Player's box. Give the box a size with `style` (a width alone keeps the aspect ratio); `getScale()` on the ref says how much it is scaled.

| Prop | Default | |
|---|---|---|
| `controls` | false | Seek bar, play, volume and fullscreen buttons. |
| `loop`, `autoPlay` | false | `autoPlay` with sound is subject to the browser's autoplay rules: use `initiallyMuted` or start from a click. |
| `initialFrame` | 0 | Frame shown on mount. |
| `inFrame`, `outFrame` | null | Play only this range. |
| `playbackRate` | 1 | From -10 to 10; negative plays backwards. |
| `clickToPlay`, `doubleClickToFullscreen`, `spaceKeyToPlayOrPause` | | Interaction; `clickToPlay` follows `controls` by default. |
| `initiallyMuted`, `initialVolume`, `showVolumeControls` | | Sound. The volume is remembered in `localStorage` unless `initialVolume` is set. |
| `renderPoster`, `showPosterWhenPaused`, `showPosterWhenUnplayed`, ... | | A poster over the canvas in given states. |
| `renderLoading`, `errorFallback` | | What to show while a lazy component loads and after the composition throws. |
| `renderPlayPauseButton`, `renderFullscreenButton`, `renderMuteButton`, `renderVolumeSlider`, `renderCustomControls` | | Replace parts of the controls. |
| `showPlaybackRateControl` | false | A speed menu; pass an array for your own rates. |
| `moveToBeginningWhenEnded` | true | Back to the start after the end when not looping. |
| `bufferStateDelayInMilliseconds` | 300 | How long buffering lasts before the UI shows it. |

`style` and `className` apply to the outer element.

## Controlling it from your code

The ref is a `PlayerRef`: `play(event?)`, `pause()`, `toggle(event?)`, `seekTo(frame)`, `getCurrentFrame()`, `isPlaying()`, `mute()`, `unmute()`, `setVolume()`, `getVolume()`, `requestFullscreen()`, `exitFullscreen()`, `getScale()`, `getContainerNode()`, and events through `addEventListener()`.

<!-- example: ../../docs/guide/examples/src/packages/player.tsx#ref -->
```tsx
import { Player, type PlayerRef } from "@motiojs/player";
import { useEffect, useRef, useState } from "react";

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
```

Events: `play`, `pause`, `ended`, `seeked`, `timeupdate` (at most every 250 ms), `frameupdate` (every displayed frame), `ratechange`, `volumechange`, `mutechange`, `scalechange`, `fullscreenchange`, `error`, `waiting` and `resume` (buffering). Each listener receives `{ detail }` with the event's data.

## Thumbnail

<!-- example: ../../docs/guide/examples/src/packages/player.tsx#thumbnail -->
```tsx
import { Thumbnail } from "@motiojs/player";

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
```

`<Thumbnail>` renders one frame (`frameToDisplay`) with the same sizing as the Player and no clock. Its ref has `getContainerNode()`, `getScale()` and the `error`, `waiting` and `resume` events.

## Loading the composition on demand

<!-- example: ../../docs/guide/examples/src/packages/player.tsx#lazy -->
```tsx
import { Player } from "@motiojs/player";

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
```

`lazyComponent` takes a function returning a dynamic import whose default export is the component. Keep the function stable (defined outside the component, or memoised): the Player loads the module again whenever it receives a new function. `renderLoading` shows while it loads.

## Media in the Player

Images, videos and sounds play in real time, so a file that is not downloaded yet makes the Player wait (it shows the buffering state and fires `waiting`). Start downloads early with [`@motiojs/preload`](../preload/README.md), or mount a scene before it plays with `premountFor` on its `<Sequence>`. Readiness calls such as `delayRender()` do not hold the Player: they matter only to renders.

## Compatibility

The compat alias maps `@remotion/player` here. Props that only make sense in Remotion's environment (`acknowledgeRemotionLicense`, `logLevel`, `preferredEffectBackend`) are accepted and ignored; `schema` is used for types only, as `inputProps` are not validated in the Player.
