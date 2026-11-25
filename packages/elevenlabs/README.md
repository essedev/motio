# @motiojs/elevenlabs

Turns ElevenLabs Speech to Text transcripts into the captions of `@motiojs/captions`, for [Motio](https://motio.esse.dev) videos. It only converts: it never calls ElevenLabs.

```bash
pnpm add @motiojs/elevenlabs
```

<!-- example: ../../docs/guide/examples/src/packages/elevenlabs.ts#captions -->
```ts
import { readFile } from "node:fs/promises";
import { serializeSrt } from "@motiojs/captions";
import {
	detectElevenLabsTranscriptFormat,
	type ElevenLabsTranscript,
	elevenLabsTranscriptToCaptions,
} from "@motiojs/elevenlabs";

// A Speech to Text response (requested with timestamps_granularity: "word") or a JSON export.
const data: unknown = JSON.parse(await readFile("transcript.json", "utf8"));
if (detectElevenLabsTranscriptFormat(data) === null) {
	throw new Error("transcript.json is not an ElevenLabs transcript");
}
// One caption per word, times in milliseconds; no request is made to ElevenLabs.
const { captions } = elevenLabsTranscriptToCaptions({ transcript: data as ElevenLabsTranscript });
const srt = serializeSrt({ lines: captions.map((caption) => [caption]) });
```

| Export | What it does |
|---|---|
| `elevenLabsTranscriptToCaptions({ transcript })` | Captions from a Speech to Text response requested with `timestamps_granularity: "word"`, or from a JSON transcript exported from ElevenLabs. In a response each word becomes a caption, audio events are skipped and spacings move the next word's start; in an export each segment becomes a caption, or each of its words when it has some. Throws an `Error` naming the first invalid field. |
| `detectElevenLabsTranscriptFormat(input)` | `"speech-to-text"`, `"segmented"` or `null`, from the keys of `input` only; never throws. |

The captions work with the rest of `@motiojs/captions`: pages for word-by-word display, SRT output.

## Compatibility

The compat alias maps `@remotion/elevenlabs` here.

Documentation: [motio.esse.dev/reference/packages/elevenlabs](https://motio.esse.dev/reference/packages/elevenlabs/) · Source: [packages/elevenlabs](https://github.com/essedev/motio/tree/main/packages/elevenlabs)
