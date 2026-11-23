# {{name}}

A video made with Motio: React components rendered frame by frame in headless Chrome and encoded with FFmpeg.

## Commands

```bash
{{install}}       # install the dependencies
{{run}} dev       # preview in the browser, with hot reload
{{run}} render    # render out/intro.mp4
{{run}} still     # render the Thumbnail still to out/thumbnail.png
```

Rendering needs FFmpeg 5.1 or later with libx264 on `PATH`, or the pinned build (`{{add}} @motiojs/ffmpeg`). The first render downloads the pinned headless Chrome. `{{exec}} motio doctor` checks both.

## Layout

- `src/index.ts`: the entry point; registers the root.
- `src/Root.tsx`: the `Intro` video and the `Thumbnail` still, with their default props.
- `src/Intro.tsx`: two scenes played one after the other with `<Series>`.
- `src/Title.tsx`: a title that springs in and fades with `spring()` and `interpolate()`.
- `src/Logo.tsx`: an image from `public/`, loaded with `staticFile()`.
- `src/Thumbnail.tsx`: a single frame, rendered with `motio still`.
- `src/fonts.ts`: loads Inter from `public/fonts/`; the render waits for it before capturing a frame.
- `public/`: static files served next to the bundle. Inter is licensed under the SIL Open Font License (`public/fonts/inter-LICENSE.txt`).

`{{exec}} motio compositions src/index.ts` lists the compositions. Every command takes `--json` for scripts and agents.
