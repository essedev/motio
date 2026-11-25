# @motiojs/openai-whisper

Turns transcriptions of OpenAI's Whisper API into the captions of `@motiojs/captions`, for [Motio](https://motio.esse.dev) videos. It only converts: it never calls OpenAI.

```bash
pnpm add @motiojs/openai-whisper
```

<!-- example: ../../docs/guide/examples/src/packages/openai-whisper.ts#captions -->
```ts
import { readFile } from "node:fs/promises";
import { serializeSrt } from "@motiojs/captions";
import {
	isOpenAiWhisperTranscript,
	type OpenAiVerboseTranscription,
	openAiWhisperApiToCaptions,
} from "@motiojs/openai-whisper";

// The verbose_json result of OpenAI's transcription API, saved as JSON; with
// timestamp_granularities: ["word"] every word becomes a caption.
const data: unknown = JSON.parse(await readFile("transcription.json", "utf8"));
if (!isOpenAiWhisperTranscript(data)) {
	throw new Error("transcription.json is not a verbose_json transcription");
}
// Runs locally: no request is made to OpenAI.
const { captions } = openAiWhisperApiToCaptions({
	transcription: data as OpenAiVerboseTranscription,
});
const srt = serializeSrt({ lines: captions.map((caption) => [caption]) });
```

| Export | What it does |
|---|---|
| `openAiWhisperApiToCaptions({ transcription })` | Captions from the `verbose_json` result of OpenAI's transcription API. With timed `words` (`timestamp_granularities: ["word"]`) each word becomes a caption carrying the punctuation and spacing around it; without words each timed segment becomes one caption. Throws an `Error` naming the first invalid field, or when a word cannot be found in the text. |
| `isOpenAiWhisperTranscript(input)` | Whether `input` looks like a `verbose_json` transcription, from its keys only; never throws. |

## Compatibility

The compat alias maps `@remotion/openai-whisper` here.

Documentation: [motio.esse.dev/reference/packages/openai-whisper](https://motio.esse.dev/reference/packages/openai-whisper/) · Source: [packages/openai-whisper](https://github.com/essedev/motio/tree/main/packages/openai-whisper)
