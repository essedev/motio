# {{name}}

A captioned video made with Motio: React components rendered frame by frame in headless Chrome and encoded with FFmpeg.

## Commands

```bash
{{install}}       # install the dependencies
{{run}} dev       # preview in the browser, with hot reload
{{run}} render    # render out/captions.mp4
{{run}} still     # render frame 30 to out/captions.png
```

Rendering needs FFmpeg 5.1 or later with libx264 on `PATH` (`brew install ffmpeg`, `sudo apt install ffmpeg`). The first render downloads the pinned headless Chrome. `{{exec}} motio doctor` checks both.

## Layout

- `src/index.ts`: the entry point; registers the root.
- `src/Root.tsx`: the `Captions` composition. Its `calculateMetadata()` loads `public/captions.json` before rendering and sets the length from the last word.
- `src/Captions.tsx`: groups the words into pages with `createTikTokStyleCaptions()` and shows each page in its own `<Sequence>`, highlighting the word being spoken.
- `public/captions.json`: one entry per word, with start and end times in milliseconds. Replace it with your own transcript; `parseSrt()` from `@motiojs/captions` reads SRT files.

`{{exec}} motio compositions src/index.ts` lists the compositions. Every command takes `--json` for scripts and agents.
