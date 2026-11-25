# @motiojs/install-whisper-cpp

Transcribe audio on your own machine with [whisper.cpp](https://github.com/ggerganov/whisper.cpp) and turn the result into captions for a [Motio](https://motio.esse.dev) video: it installs whisper.cpp and its models, runs a transcription and converts the output. Runs in Node.

```bash
pnpm add @motiojs/install-whisper-cpp
```

<!-- example: ../../docs/guide/examples/src/packages/install-whisper-cpp.ts#transcribe -->
```ts
import {
	downloadWhisperModel,
	installWhisperCpp,
	toCaptions,
	transcribe,
} from "@motiojs/install-whisper-cpp";

const whisperPath = "whisper.cpp";
const version = "1.5.5";

// Clones and builds whisper.cpp (needs git and a C++ toolchain), then downloads a model into
// the same folder. Both do nothing when already done.
await installWhisperCpp({ to: whisperPath, version });
await downloadWhisperModel({ model: "medium.en", folder: whisperPath });

// The input must be a 16-bit, 16 kHz WAVE file.
const output = await transcribe({
	inputPath: "audio.wav",
	whisperPath,
	whisperCppVersion: version,
	model: "medium.en",
	tokenLevelTimestamps: true,
});
const { captions } = toCaptions({ whisperCppOutput: output });
```

| Export | What it does |
|---|---|
| `installWhisperCpp({ to, version })` | Clones whisper.cpp into a folder, checks out the release (`v` + `version`) or commit and builds it with `make` (from 1.7.3 its Makefile calls CMake, which must be installed). Needs git and a C++ toolchain; Windows is not supported yet. Resolves to `{ alreadyExisted: true }` when the folder already holds the executable. |
| `downloadWhisperModel({ model, folder })` | Downloads a model (`WHISPER_MODELS`: `tiny` to `large-v3-turbo`, `.en` variants) as `ggml-<model>.bin` into an existing folder, through a temporary name so an interrupted download does not count. |
| `transcribe(options)` | Transcribes a 16-bit, 16 kHz WAVE file and resolves to whisper.cpp's JSON output. Options include `language`, `translateToEnglish`, `tokenLevelTimestamps` (whisper.cpp 1.5.5 or later), `splitOnWord`, `onProgress`, `signal` and `additionalArgs`. |
| `toCaptions({ whisperCppOutput })` | Captions from a `transcribe()` result made with `tokenLevelTimestamps: true`. |

## Compatibility

The compat alias maps `@remotion/install-whisper-cpp` here. Deliberate differences: whisper.cpp writes its JSON to a fresh temporary folder instead of the working directory, so concurrent calls do not collide; a WAVE file that is not 16 kHz is rejected from its header before whisper.cpp runs; `installWhisperCpp()` throws on Windows; the deprecated `convertToCaptions()` throws and points to `toCaptions()`.

Documentation: [motio.esse.dev/reference/packages/install-whisper-cpp](https://motio.esse.dev/reference/packages/install-whisper-cpp/) · Source: [packages/install-whisper-cpp](https://github.com/essedev/motio/tree/main/packages/install-whisper-cpp)
