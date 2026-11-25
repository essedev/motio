# @motiojs/lottie

Lottie animations for [Motio](https://motio.esse.dev), played by lottie-web and seeked to the timeline's frame instead of running on the clock, so every render shows the same frame at the same time.

```bash
pnpm add @motiojs/lottie lottie-web
```

## Play an animation

Pass the animation JSON as `animationData`, imported or fetched. Rendering waits until lottie-web has loaded it.

<!-- example: ../../docs/guide/examples/src/packages/lottie.tsx#fetched -->
```tsx
import { Lottie, type LottieAnimationData } from "@motiojs/lottie";
import {
	AbsoluteFill,
	cancelRender,
	continueRender,
	delayRender,
	staticFile,
} from "@motiojs/motio";
import { useEffect, useState } from "react";

// An animation JSON from public/, loaded before the first frame is captured.
export const Badge = () => {
	const [handle] = useState(() => delayRender("Loading Lottie animation"));
	const [data, setData] = useState<LottieAnimationData | null>(null);
	useEffect(() => {
		fetch(staticFile("badge.json"))
			.then((response) => response.json())
			.then((json) => {
				setData(json);
				continueRender(handle);
			})
			.catch((err) => cancelRender(err));
	}, [handle]);
	if (!data) return null;
	return (
		<AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
			<Lottie animationData={data} loop playbackRate={1.5} style={{ width: 400, height: 300 }} />
		</AbsoluteFill>
	);
};
```

## Exports

| Export | What it does |
|---|---|
| `<Lottie>` | Plays the animation in sync with the timeline: each composition frame advances `playbackRate` animation frames, holding the last frame unless `loop`. Props: `animationData`, `loop`, `direction` (`"forward"` or `"backward"`), `playbackRate`, `renderer` (`"svg"` by default), `preserveAspectRatio`, `assetsPath`, `onAnimationLoaded` (lottie-web's `AnimationItem`), `className`, `style` and the `<Sequence>` timing props. |
| `getLottieMetadata(data)` | The width, height, frame rate and duration of an animation, read from its JSON, or `null` when one of them is missing or zero. |

## Compatibility

The compat alias maps `@remotion/lottie` here. One composition frame advances `playbackRate` animation frames whatever the two frame rates are, as in Remotion: a 25 fps animation in a 30 fps composition plays at 30 fps.

Documentation: [motio.esse.dev/reference/packages/lottie](https://motio.esse.dev/reference/packages/lottie/) · Source: [packages/lottie](https://github.com/essedev/motio/tree/main/packages/lottie)
