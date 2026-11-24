import { basename, extname } from "node:path";
import type { AudioCodec } from "@motiojs/audio";
import { AUDIO_EXTENSIONS, isAudioOnlyCodec } from "./audio-options.js";
import { VIDEO_CODEC_SPECS } from "./codecs.js";
import { MotioError } from "./errors.js";
import { CODECS, type Codec } from "./options.js";

/** The file an output is written to: its extension, with the dot, and the FFmpeg muxer. */
export interface OutputContainer {
	extension: string;
	/** Muxer of a video output; null for audio, where FFmpeg picks it from the extension. */
	muxer: string | null;
}

/**
 * Extensions an output may have, by codec and by the audio codec it carries (null when muted),
 * the codec's own first. Recorded from the published Remotion package, which rejects any other
 * extension before rendering and writes the container the extension names: `vp9` goes to
 * `.webm` only, `h264` to `.mp4`, `.mkv` or `.mov`. Two of its extensions are left out: `.mxf`
 * for ProRes, which its own FFmpeg fails to write, and `.mpg` or `.mpeg` for AAC, which MPEG
 * program streams do not carry.
 */
export function outputExtensions(codec: Codec, audioCodec: AudioCodec | null): readonly string[] {
	switch (codec) {
		case "h264":
			return audioCodec === "pcm-16" ? ["mkv", "mov"] : ["mp4", "mkv", "mov"];
		case "h265":
			return audioCodec === "pcm-16" ? ["mkv"] : ["mp4", "mkv", "hevc"];
		case "vp8":
		case "vp9":
			return audioCodec === "pcm-16" ? ["mkv"] : ["webm"];
		case "av1":
			if (audioCodec === "opus") return ["webm", "mkv"];
			return audioCodec === "pcm-16" ? ["mkv"] : ["mp4", "mkv"];
		case "prores":
			return ["mov", "mkv"];
		case "h264-mkv":
			return ["mkv"];
		case "h264-ts":
			return ["ts"];
		case "gif":
			return ["gif"];
		case "mp3":
			return audioCodec === "pcm-16" ? ["wav"] : ["mp3"];
		case "aac":
			return audioCodec === "pcm-16" ? ["wav"] : ["aac", "m4a", "m4b", "3gp"];
		case "wav":
			return ["wav"];
	}
}

/** Every extension some codec writes, in the order of the codec list. */
export function knownExtensions(): string[] {
	const out: string[] = [];
	for (const codec of CODECS) {
		for (const audio of [null, "aac", "mp3", "pcm-16", "opus"] as const) {
			for (const e of outputExtensions(codec, audio)) if (!out.includes(e)) out.push(e);
		}
	}
	return out;
}

const MUXERS: Record<string, string> = {
	mp4: "mp4",
	mov: "mov",
	mkv: "matroska",
	webm: "webm",
	ts: "mpegts",
	hevc: "hevc",
	gif: "gif",
};

/**
 * The container of an output: the codec's own when the output is a buffer, else the one its file
 * extension names. An extension the codec cannot be written to fails with `E_INVALID_OPTION`
 * before anything renders, naming the extensions that work and the codecs that write the given
 * one (FFmpeg would otherwise write, say, WebM into a file called `.mp4`).
 */
export function resolveOutputContainer(
	codec: Codec,
	audioCodec: AudioCodec | null,
	outputLocation: string | null | undefined,
): OutputContainer {
	const own = isAudioOnlyCodec(codec)
		? { extension: AUDIO_EXTENSIONS[audioCodec ?? "pcm-16"], muxer: null }
		: { extension: VIDEO_CODEC_SPECS[codec].extension, muxer: VIDEO_CODEC_SPECS[codec].muxer };
	if (!outputLocation) return own;
	const allowed = outputExtensions(codec, audioCodec);
	const extension = extname(outputLocation).slice(1).toLowerCase();
	if (!allowed.includes(extension)) {
		const name = basename(outputLocation);
		const details = {
			option: "outputLocation",
			codec,
			audioCodec,
			outputLocation,
			extensions: allowed,
		};
		const known = knownExtensions();
		if (!extension || !known.includes(extension)) {
			// Nothing writes this extension: the codec is beside the point, whichever was chosen.
			const what = extension
				? `has an extension no codec writes (.${extension})`
				: "has no extension";
			throw new MotioError(
				"E_INVALID_OPTION",
				`The output "${name}" ${what}. The extension chooses the container: use one of ${known.map((e) => `.${e}`).join(" ")} (${codec} writes ${allowed.map((e) => `.${e}`).join(", ")}).`,
				{ details: { ...details, supported: known } },
			);
		}
		const withAudio = audioCodec ? ` with ${audioCodec} audio` : "";
		const list = allowed.map((e) => `.${e}`).join(", ");
		const others = CODECS.filter(
			(c) => c !== codec && outputExtensions(c, null).includes(extension),
		);
		const hint = others.length
			? ` Rename the output, or choose a codec that writes .${extension} (${others.join(", ")}).`
			: " Rename the output.";
		throw new MotioError(
			"E_INVALID_OPTION",
			`The output "${name}" does not fit the codec ${codec}${withAudio}, which is written to ${list}.${hint}`,
			{ details },
		);
	}
	if (extension === "hevc" && audioCodec) {
		throw new MotioError(
			"E_INVALID_OPTION",
			`An .hevc file holds the video stream alone, so "${basename(outputLocation)}" cannot carry ${audioCodec} audio. Render it muted, or write .mp4 or .mkv.`,
			{ details: { option: "outputLocation", codec, audioCodec, outputLocation } },
		);
	}
	return {
		extension: `.${extension}`,
		muxer: isAudioOnlyCodec(codec) ? null : (MUXERS[extension] ?? null),
	};
}
