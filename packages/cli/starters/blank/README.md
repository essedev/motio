# {{name}}

A video made with Motio: React components rendered frame by frame in headless Chrome and encoded with FFmpeg.

## Commands

```bash
{{install}}       # install the dependencies
{{run}} dev       # preview in the browser, with hot reload
{{run}} render    # render out/main.mp4
{{run}} still     # render frame 0 to out/main.png
```

Rendering needs FFmpeg 5.1 or later with libx264 on `PATH` (`brew install ffmpeg`, `sudo apt install ffmpeg`). The first render downloads the pinned headless Chrome. `{{exec}} motio doctor` checks both.

## Layout

- `src/index.ts`: the entry point; registers the root.
- `src/Root.tsx`: the compositions: id, size, frame rate, length and default props.
- `src/Main.tsx`: the component of the `Main` composition. It reads the current frame with `useCurrentFrame()` and derives everything it draws from it.

`{{exec}} motio compositions src/index.ts` lists the compositions. Every command takes `--json` for scripts and agents.
