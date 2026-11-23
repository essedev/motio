/** A timestamp pair as whisper.cpp prints it (`00:00:01,230`). */
export type Timestamps = { from: string; to: string };

/** A time span in milliseconds. */
export type Offsets = { from: number; to: number };

/** A token with its probability and, with `--dtw`, its token-level time (`t_dtw`, in 10 ms). */
export type WordLevelToken = {
	t_dtw: number;
	text: string;
	timestamps: Timestamps;
	offsets: Offsets;
	id: number;
	p: number;
};

/** An item of a transcription. */
export type TranscriptionItem = { timestamps: Timestamps; offsets: Offsets; text: string };

/** An item with its tokens (whisper.cpp's full JSON output). */
export type TranscriptionItemWithTimestamp = TranscriptionItem & { tokens: WordLevelToken[] };

/** The model whisper.cpp reports. */
export type Model = {
	type: string;
	multilingual: boolean;
	vocab: number;
	audio: { ctx: number; state: number; head: number; layer: number };
	text: { ctx: number; state: number; head: number; layer: number };
	mels: number;
	ftype: number;
};

/** The parameters whisper.cpp reports. */
export type Params = { model: string; language: string; translate: boolean };

/** What whisper.cpp detected. */
export type Result = { language: string };

/** The JSON whisper.cpp writes, as `transcribe()` resolves it. */
export type TranscriptionJson<WithTokenLevelTimestamp extends boolean> = {
	systeminfo: string;
	model: Model;
	params: Params;
	result: Result;
	transcription: true extends WithTokenLevelTimestamp
		? TranscriptionItemWithTimestamp[]
		: TranscriptionItem[];
};
