# Motio guide

Motio makes videos with React. A video is a React component that draws one frame at a time: Motio tells it which frame to draw, takes a screenshot in a real headless Chrome, and encodes the screenshots with FFmpeg. Because each frame is a function of its number, any frame can be rendered alone, in any order, on any number of browser tabs, and always gives the same pixels.

This guide is for people starting with Motio. It assumes you know React and TypeScript, and nothing else about video.

1. [Getting started](getting-started.md): create a project with `motio init`, preview it, render it.
2. [Project structure](project-structure.md): what each file of a project does.
3. Core concepts
   - [Frames and time](frames-and-time.md): `useCurrentFrame()`, frame rates, determinism.
   - [Compositions](compositions.md): videos and stills, props, metadata computed from data.
   - [Sequences and series](sequences.md): placing things on the timeline.
   - [Animation](animation.md): `interpolate()`, `spring()`, easing, colours.
   - [Media](media.md): images, animated images, video, audio, preloading for the Player.
   - [Fonts and text](fonts-and-text.md): local files, Google Fonts, backgrounds that follow lines of text.
   - [Readiness](readiness.md): making the render wait for data with `delayRender()`.
4. [Rendering from the CLI](rendering-cli.md): videos, stills, image sequences, codecs.
5. [Rendering from Node](rendering-node.md): the same pipeline as a library, media functions, one browser for many renders.
6. [FFmpeg](ffmpeg.md): which FFmpeg Motio uses, the pinned build, codecs and encoders.
7. [Testing renders in CI](testing-in-ci.md): determinism and flicker checks, `--json`.
8. [Coming from Remotion](coming-from-remotion.md): running a Remotion project on Motio.

Every code sample in these pages is a file under [`examples/`](examples/), type-checked with the rest of the repository by `make check`.
