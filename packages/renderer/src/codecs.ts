import type { AudioCodec } from "@motiojs/audio";
import { MotioError } from "./errors.js";
import type { Codec, PixelFormat } from "./options.js";

/** Values of Remotion's `proResProfile`. */
export const PRORES_PROFILES = ["4444-xq", "4444", "hq", "standard", "light", "proxy"] as const;
/** A ProRes profile. */
export type ProResProfile = (typeof PRORES_PROFILES)[number];

/** `prores_ks` profile numbers, as Remotion documents them. */
const PRORES_PROFILE_NUMBERS: Record<ProResProfile, number> = {
	proxy: 0,
	light: 1,
	standard: 2,
	hq: 3,
	"4444": 4,
	"4444-xq": 5,
};

/** Video codecs Motio encodes. */
export const VIDEO_CODECS = [
	"h264",
	"h264-mkv",
	"h264-ts",
	"h265",
	"vp8",
	"vp9",
	"av1",
	"prores",
	"gif",
] as const;
/** A video `codec` Motio encodes. */
export type VideoCodec = (typeof VIDEO_CODECS)[number];

/** How one video codec is encoded and stored. */
export interface VideoCodecSpec {
	/**
	 * FFmpeg encoders that produce the codec, in order of preference: the render uses the first
	 * one the FFmpeg build has and fails early when it has none.
	 */
	encoders: readonly [string, ...string[]];
	/** FFmpeg muxer of the output. */
	muxer: string;
	/** Extension of the output file, with the dot. */
	extension: string;
	contentType: string;
	/** Valid CRF values and the default (Remotion's table); null when the codec takes no CRF. */
	crf: { min: number; max: number; default: number } | null;
	/** Pixel formats the encoder accepts; the first is the default. Empty for GIF. */
	pixelFormats: readonly PixelFormat[];
	/** Pixel formats with an alpha channel among `pixelFormats`. */
	alphaPixelFormats: readonly PixelFormat[];
	/** Audio codecs the container carries, the default first (D-037); empty without audio. */
	audioCodecs: readonly AudioCodec[];
	/** Whether `x264Preset` applies. */
	x264: boolean;
}

const YUV_8_10: readonly PixelFormat[] = [
	"yuv420p",
	"yuv422p",
	"yuv444p",
	"yuv420p10le",
	"yuv422p10le",
	"yuv444p10le",
];

const H264 = {
	encoders: ["libx264"],
	crf: { min: 1, max: 51, default: 18 },
	pixelFormats: YUV_8_10,
	alphaPixelFormats: [],
	x264: true,
} as const;

/** The codec table (D-037). */
export const VIDEO_CODEC_SPECS: Readonly<Record<VideoCodec, VideoCodecSpec>> = {
	h264: {
		...H264,
		muxer: "mp4",
		extension: ".mp4",
		contentType: "video/mp4",
		audioCodecs: ["aac", "mp3"],
	},
	"h264-mkv": {
		...H264,
		muxer: "matroska",
		extension: ".mkv",
		contentType: "video/x-matroska",
		audioCodecs: ["aac", "mp3", "opus", "pcm-16"],
	},
	"h264-ts": {
		...H264,
		muxer: "mpegts",
		extension: ".ts",
		contentType: "video/mp2t",
		audioCodecs: ["aac", "mp3"],
	},
	h265: {
		encoders: ["libx265"],
		muxer: "mp4",
		extension: ".mp4",
		contentType: "video/mp4",
		crf: { min: 0, max: 51, default: 23 },
		pixelFormats: YUV_8_10,
		alphaPixelFormats: [],
		audioCodecs: ["aac", "mp3"],
		x264: false,
	},
	vp8: {
		encoders: ["libvpx"],
		muxer: "webm",
		extension: ".webm",
		contentType: "video/webm",
		crf: { min: 4, max: 63, default: 9 },
		pixelFormats: ["yuv420p", "yuva420p"],
		alphaPixelFormats: ["yuva420p"],
		audioCodecs: ["opus"],
		x264: false,
	},
	vp9: {
		encoders: ["libvpx-vp9"],
		muxer: "webm",
		extension: ".webm",
		contentType: "video/webm",
		crf: { min: 0, max: 63, default: 28 },
		pixelFormats: ["yuv420p", "yuva420p", ...YUV_8_10.slice(1)],
		alphaPixelFormats: ["yuva420p"],
		audioCodecs: ["opus"],
		x264: false,
	},
	// SVT-AV1 first (BSD licence with a patent grant, fast); libaom when a build has only that.
	// Both encoders take 8- and 10-bit 4:2:0 and neither stores alpha (D-064).
	av1: {
		encoders: ["libsvtav1", "libaom-av1"],
		muxer: "mp4",
		extension: ".mp4",
		contentType: "video/mp4",
		crf: { min: 0, max: 63, default: 30 },
		pixelFormats: ["yuv420p", "yuv420p10le"],
		alphaPixelFormats: [],
		audioCodecs: ["aac", "mp3"],
		x264: false,
	},
	prores: {
		encoders: ["prores_ks"],
		muxer: "mov",
		extension: ".mov",
		contentType: "video/quicktime",
		crf: null,
		pixelFormats: ["yuv422p10le", "yuv444p10le", "yuva444p10le"],
		alphaPixelFormats: ["yuva444p10le"],
		audioCodecs: ["pcm-16", "aac"],
		x264: false,
	},
	gif: {
		encoders: ["gif"],
		muxer: "gif",
		extension: ".gif",
		contentType: "image/gif",
		crf: null,
		pixelFormats: [],
		alphaPixelFormats: [],
		audioCodecs: [],
		x264: false,
	},
};

/** True for the video codecs Motio encodes. */
export function isVideoCodec(codec: Codec): codec is VideoCodec {
	return (VIDEO_CODECS as readonly string[]).includes(codec);
}

function invalid(message: string): MotioError {
	return new MotioError("E_INVALID_OPTION", message);
}

/** Validated encoding settings of a video codec. */
export interface ResolvedVideoEncoding {
	codec: VideoCodec;
	spec: VideoCodecSpec;
	/** Null for ProRes and GIF. */
	crf: number | null;
	/** Null for GIF, which is encoded from RGB. */
	pixelFormat: PixelFormat | null;
	/** Whether the output keeps an alpha channel. */
	alpha: boolean;
	/** Set for ProRes only. */
	proResProfile: ProResProfile | null;
	proResBitsPerMacroblock: number | null;
	/** `-loop` value of a GIF (D-020); null for other codecs. */
	gifLoop: number | null;
}

/** Encoding options as `renderMedia` receives them. */
export interface VideoEncodingOptions {
	codec: VideoCodec;
	crf?: number | null | undefined;
	pixelFormat?: PixelFormat | null | undefined;
	/** Explicit `proResProfile`: only valid with `prores`. */
	proResProfile?: ProResProfile | null | undefined;
	/** The composition's default ProRes profile, used for `prores` when no profile is given. */
	defaultProResProfile?: string | null | undefined;
	proResBitsPerMacroblock?: number | null | undefined;
	numberOfGifLoops?: number | null | undefined;
	imageFormat: "jpeg" | "png";
}

/**
 * Validates the codec-dependent options (D-037): the CRF range and default of the codec, that
 * ProRes and GIF take no CRF, the pixel formats the encoder accepts, alpha only with PNG
 * capture, and the ProRes profile.
 */
export function resolveVideoEncoding(options: VideoEncodingOptions): ResolvedVideoEncoding {
	const { codec } = options;
	const spec = VIDEO_CODEC_SPECS[codec];
	let crf: number | null = null;
	if (spec.crf) {
		const value = options.crf ?? spec.crf.default;
		if (!Number.isInteger(value) || value < spec.crf.min || value > spec.crf.max) {
			throw invalid(
				`crf for ${codec} must be an integer between ${spec.crf.min} and ${spec.crf.max}, got ${value}`,
			);
		}
		crf = value;
	} else if (options.crf !== null && options.crf !== undefined) {
		throw invalid(`crf cannot be used with the codec "${codec}", which has no CRF option.`);
	}

	let proResProfile: ProResProfile | null = null;
	if (codec === "prores") {
		const value = options.proResProfile ?? options.defaultProResProfile ?? "hq";
		if (!(PRORES_PROFILES as readonly string[]).includes(value)) {
			throw invalid(
				`proResProfile must be one of ${PRORES_PROFILES.map((p) => `"${p}"`).join(", ")}, got ${JSON.stringify(value)}`,
			);
		}
		proResProfile = value as ProResProfile;
	} else if (options.proResProfile !== null && options.proResProfile !== undefined) {
		throw invalid(`proResProfile is only valid with the codec "prores", not "${codec}".`);
	}
	let proResBitsPerMacroblock: number | null = null;
	const bits = options.proResBitsPerMacroblock;
	if (bits !== null && bits !== undefined) {
		if (codec !== "prores") {
			throw invalid(`proResBitsPerMacroblock is only valid with the codec "prores".`);
		}
		if (!Number.isInteger(bits) || bits < 128 || bits > 8192) {
			throw invalid(`proResBitsPerMacroblock must be an integer from 128 to 8192, got ${bits}`);
		}
		proResBitsPerMacroblock = bits;
	}

	let pixelFormat: PixelFormat | null = null;
	let alpha = false;
	if (codec === "gif") {
		// GIF is encoded from RGB(A) with a palette; transparency follows the PNG capture.
		alpha = options.imageFormat === "png";
	} else {
		const fourFour = proResProfile === "4444" || proResProfile === "4444-xq";
		const fallback: PixelFormat =
			codec === "prores" ? (fourFour ? "yuv444p10le" : "yuv422p10le") : "yuv420p";
		const value = options.pixelFormat ?? fallback;
		if (!spec.pixelFormats.includes(value)) {
			throw invalid(
				spec.alphaPixelFormats.length === 0 && value.startsWith("yuva")
					? `pixelFormat "${value}" has an alpha channel, which ${codec} cannot store. Use vp8, vp9 or prores (4444) for transparent video.`
					: `pixelFormat "${value}" cannot be used with ${codec}; use one of ${spec.pixelFormats.join(", ")}.`,
			);
		}
		alpha = spec.alphaPixelFormats.includes(value);
		if (alpha && codec === "prores" && !fourFour) {
			throw invalid(
				`pixelFormat "${value}" needs the ProRes profile "4444" or "4444-xq", not "${proResProfile}".`,
			);
		}
		if (alpha && options.imageFormat !== "png") {
			throw invalid(
				`pixelFormat "${value}" renders a transparent video, which needs imageFormat "png".`,
			);
		}
		pixelFormat = value;
	}

	let gifLoop: number | null = null;
	if (codec === "gif") {
		const loops = options.numberOfGifLoops;
		if (loops !== null && loops !== undefined && (!Number.isInteger(loops) || loops < 0)) {
			throw invalid(`numberOfGifLoops must be null or an integer of at least 0, got ${loops}`);
		}
		// D-020: null loops forever (-loop 0), 0 plays once (-loop -1), n repeats n times.
		gifLoop = loops === null || loops === undefined ? 0 : loops === 0 ? -1 : loops;
	}
	return {
		codec,
		spec,
		crf,
		pixelFormat,
		alpha,
		proResProfile,
		proResBitsPerMacroblock,
		gifLoop,
	};
}

/** `prores_ks` profile number of a profile. */
export function proResProfileNumber(profile: ProResProfile): number {
	return PRORES_PROFILE_NUMBERS[profile];
}
