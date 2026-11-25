# @motiojs/video-frames

Exact frame extraction for the videos a [Motio](https://motio.esse.dev) composition embeds: it picks the source frame to show at each video frame from the packet timestamps, extracts it with FFmpeg, batched and cached, and keeps the alpha plane of transparent VP8 and VP9 videos. It runs in Node, outside the browser.

It is an internal package: `@motiojs/renderer` depends on it to serve the frames of `<OffthreadVideo>` and the other video components while rendering. Do not install it directly.

Documentation: [motio.esse.dev/reference/packages/video-frames](https://motio.esse.dev/reference/packages/video-frames/) · Guide: [Media](https://motio.esse.dev/guide/media/) · Source: [packages/video-frames](https://github.com/essedev/motio/tree/main/packages/video-frames)
