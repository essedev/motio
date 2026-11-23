# Compatibility: @motiojs/fonts

Target: `@remotion/fonts@4.0.545`. Proof: `fixtures/media-utils/__golden__/remotion/fonts.json`, recorded in chrome-headless-shell 158 by `tools/oracle-render/record-media-utils.ts` and compared by `src/fonts.integration.test.ts` over the cases in `fixtures/media-utils/fonts-probe.ts` (the fonts share the media-utils fixture server).

| Export | Status | Tolerance |
|---|---|---|
| `loadFont` | exact | same resolution or rejection (same error class, Motio's own message), same registered `FontFace` descriptors, same requests |

Measured behaviour: the format is derived from the URL extension (case-insensitive, query and hash ignored; `woff2`, `woff`, `otf`, `ttf`) before anything is fetched, and a URL without one rejects asking for `format`. The file is fetched once per URL as bytes (a 404 rejects with an `Error` naming the URL and the HTTP status), so an explicit `format` that does not match the file still loads. The render is blocked with `delayRender()` until the face is added to `document.fonts`, and a failure fails the render with `cancelRender()`.
