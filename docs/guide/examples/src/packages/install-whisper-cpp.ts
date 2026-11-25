import {
	downloadWhisperModel,
	installWhisperCpp,
	toCaptions,
	transcribe,
} from "@motiojs/install-whisper-cpp";

// region: transcribe
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
// endregion

export const all = [captions];
