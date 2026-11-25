# @motiojs/audio

The audio mixer of [Motio](https://motio.esse.dev): it decodes every audio source of a render with FFmpeg, mixes them in floating point with sample-accurate offsets and per-frame volume, and encodes the result once. Trims, `playbackRate` (pitch preserved unless asked otherwise) and `toneFrequency` are applied as FFmpeg filters before the mix.

It is an internal package, used by `@motiojs/renderer` and `@motiojs/distributed` for the audio of `renderMedia()` and of chunked renders. Do not install it directly: the audio options of a render (`muted`, `audioCodec`, `audioBitrate`, `sampleRate`, `enforceAudioTrack`) reach it through those packages.

Documentation: [motio.esse.dev/reference/packages/audio](https://motio.esse.dev/reference/packages/audio/) · Guide: [Media](https://motio.esse.dev/guide/media/) · Source: [packages/audio](https://github.com/essedev/motio/tree/main/packages/audio)
