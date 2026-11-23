# Motio

Make videos with React. Motio renders a React tree frame by frame in a real headless Chrome and encodes it with FFmpeg. Its public API is compatible with Remotion's documented API, so existing projects can move over by changing imports, or with no change through the bundler alias. Apache-2.0, free for any use.

> Status: pre-alpha, under active development. Nothing is published on npm yet.

[Leggi in italiano](README.it.md)

## Why

- **Open source**: Apache-2.0, no per-render or per-seat fees, including distributed rendering and embedding the Player.
- **Chrome pixels**: no reimplementation of CSS or layout; if it looks right in Chrome, it renders right.
- **Deterministic by test**: the same project, props and frame give the same pixels in any order, checked on decoded frame hashes.
- **Agent-first**: every command has `--json` output, errors with stable codes, stills, contact sheets, flicker and determinism checks.

## Requirements

- Node 22 or later, pnpm.
- FFmpeg 5.1 or later with libx264 on `PATH` (`motio doctor` checks it), or the optional pinned build below.
- The pinned `chrome-headless-shell` is downloaded on first use (`motio browser ensure`).

## Pinned FFmpeg (optional)

`pnpm add -D @motiojs/ffmpeg` gives every render the same FFmpeg 8.1.3 build, with every encoder Motio uses (H.264, H.265, AV1, VP8, VP9, ProRes, AAC, MP3, Opus), downloaded on first use (or with `motio ffmpeg ensure`) and checked against a SHA-256 committed in the package. Without it, Motio uses the FFmpeg on `PATH`; `MOTIO_FFMPEG` always wins over both.

The downloaded binaries are GPL-licensed FFmpeg builds (GPL-3.0-or-later). Their exact sources, the build scripts ([`tools/ffmpeg-build/`](tools/ffmpeg-build/)) and the licence texts are published with each release of the archives. Motio runs FFmpeg as a separate program, so using them does not change the licence of Motio, of your project or of your videos. Details in [the package README](packages/ffmpeg/README.md) and D-065.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Decisions](docs/DECISIONS.md)
- [Conventions](docs/CONVENTIONS.md)

## Development

```bash
pnpm install
make check              # format, lint, build, tests
make test-integration   # real Chrome and FFmpeg
```

## Licence

Apache-2.0, see [LICENSE](LICENSE) and [NOTICE](NOTICE). Remotion is a trademark of its owner; Motio is an independent project, not affiliated with or endorsed by Remotion.
