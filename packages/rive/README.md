# @motiojs/rive

Rive animations for [Motio](https://motio.esse.dev): `<RemotionRiveCanvas>` draws a `.riv` file on a canvas with the official Rive web runtime and seeks its animation to the frame's time on every frame, so nothing runs on the real clock. Rendering waits until the runtime and the file are loaded.

```bash
pnpm add @motiojs/rive
```

## Play an animation

<!-- example: ../../docs/guide/examples/src/packages/rive.tsx#rive -->
```tsx
import { AbsoluteFill, staticFile } from "@motiojs/motio";
import { RemotionRiveCanvas } from "@motiojs/rive";

// The "idle" animation of public/truck.riv, covering the canvas, at 1.5 times its speed.
export const Truck = () => (
	<AbsoluteFill style={{ backgroundColor: "#eef1f6" }}>
		<RemotionRiveCanvas
			src={staticFile("truck.riv")}
			animation="idle"
			fit="cover"
			playbackRate={1.5}
		/>
	</AbsoluteFill>
);
```

## Props

| Prop | What it does |
|---|---|
| `src` | URL of the `.riv` file: a `staticFile()` or a remote URL served with CORS. |
| `fit`, `alignment` | How the artboard is scaled (default `"contain"`) and placed (default `"center"`) in the canvas. |
| `artboard`, `animation` | Name or index. Default: the file's default artboard and its first animation. |
| `onLoad` | Called with the loaded Rive `File`; memoize it with `useCallback`. |
| `enableRiveAssetCdn`, `assetLoader` | Whether referenced assets may come from Rive's CDN (default `true`), or a loader of your own. |
| `className`, `style` | Class and styles of the `<canvas>`. |
| `from`, `durationInFrames`, `trimBefore`, `playbackRate`, `loop`, `freeze` | Timing, as on a `<Sequence>`. |

A ref exposes the runtime objects behind the canvas: `getAnimationInstance()`, `getArtboard()`, `getRenderer()` and `getCanvas()`, each `null` before the file is loaded.

## Compatibility

The compat alias maps `@remotion/rive` here, with the same `@rive-app/canvas-advanced` version as the published package. `effects` is not supported and must be empty or absent.

Documentation: [motio.esse.dev/reference/packages/rive](https://motio.esse.dev/reference/packages/rive/) · Source: [packages/rive](https://github.com/essedev/motio/tree/main/packages/rive)
