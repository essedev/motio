/** A timed word of a verbose transcription (`timestamp_granularities: ["word"]`). */
export interface OpenAiWhisperWord {
	word: string;
	/** Seconds from the start of the audio. */
	start: number;
	/** Seconds from the start of the audio. */
	end: number;
}

/** A timed segment of a verbose transcription. Other fields of the API are allowed. */
export interface OpenAiWhisperSegment {
	text: string;
	/** Seconds from the start of the audio. */
	start: number;
	/** Seconds from the start of the audio. */
	end: number;
	[key: string]: unknown;
}

/**
 * The `verbose_json` result of `openai.audio.transcriptions.create()`: the full `text` and timed
 * `words` or `segments`. Other fields of the API are allowed.
 */
export interface OpenAiVerboseTranscription {
	text: string;
	words?: OpenAiWhisperWord[];
	segments?: OpenAiWhisperSegment[];
	task?: string;
	language?: string;
	duration?: number;
	[key: string]: unknown;
}
