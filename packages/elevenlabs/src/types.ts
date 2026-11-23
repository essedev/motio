/** An entry of `words` in a Speech to Text response (`timestamps_granularity: "word"`). */
export interface ElevenLabsWord {
	text: string;
	type: "word" | "spacing" | "audio_event";
	/** Seconds from the start of the audio. */
	start: number;
	/** Seconds from the start of the audio. */
	end: number;
	[key: string]: unknown;
}

/** A Speech to Text API response. Other fields of the API are allowed. */
export interface ElevenLabsSpeechToTextTranscript {
	language_code: string | null;
	words: ElevenLabsWord[];
	[key: string]: unknown;
}

/** A timed word of a segment in a JSON export. */
export interface ElevenLabsSegmentWord {
	text: string;
	/** Seconds from the start of the audio, not of the segment. */
	start_time: number;
	/** Seconds from the start of the audio, not of the segment. */
	end_time: number;
	[key: string]: unknown;
}

/** A segment of a JSON export. */
export interface ElevenLabsSegment {
	text: string;
	/** Seconds from the start of the audio. */
	start_time: number;
	/** Seconds from the start of the audio. */
	end_time: number;
	words?: ElevenLabsSegmentWord[];
	[key: string]: unknown;
}

/** A transcript exported from ElevenLabs as JSON. */
export interface ElevenLabsSegmentedTranscript {
	language_code: string | null;
	segments: ElevenLabsSegment[];
	[key: string]: unknown;
}

/** Either transcript format {@link elevenLabsTranscriptToCaptions} accepts. */
export type ElevenLabsTranscript = ElevenLabsSpeechToTextTranscript | ElevenLabsSegmentedTranscript;

/** The format {@link detectElevenLabsTranscriptFormat} recognizes. */
export type ElevenLabsTranscriptFormat = "speech-to-text" | "segmented";
