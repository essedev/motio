import { getAudioData } from "./get-audio-data.js";
import { isReadableWav, parseWavHeader, readChannel, type WavInfo } from "./wav.js";

/** A source the windowed hook can read window by window. */
export interface WindowedSource {
	sampleRate: number;
	numberOfChannels: number;
	durationInSeconds: number;
	/** Number of sample frames. */
	frames: number;
	/** Samples `[from, to)` of one channel. */
	read(channel: number, from: number, to: number): Promise<Float32Array>;
}

const HEADER_BYTES = 64 * 1024;

function fetchError(src: string, response: Response): Error {
	return new Error(`Error fetching ${src}: ${response.status} ${response.statusText}`);
}

function totalSize(response: Response, received: number): number {
	const range = response.headers.get("content-range");
	const total = range?.match(/\/(\d+)\s*$/)?.[1];
	return total === undefined ? received : Number(total);
}

function wavSource(
	src: string,
	info: WavInfo,
	requestInit: RequestInit | undefined,
	whole: Uint8Array | null,
): WindowedSource {
	const blockAlign = (info.bitsPerSample / 8) * info.numberOfChannels;
	return {
		sampleRate: info.sampleRate,
		numberOfChannels: info.numberOfChannels,
		durationInSeconds: info.frames / info.sampleRate,
		frames: info.frames,
		async read(channel, from, to) {
			const start = info.dataOffset + from * blockAlign;
			const end = info.dataOffset + to * blockAlign;
			if (to <= from) return new Float32Array(0);
			if (whole !== null) return readChannel(info, whole.subarray(start, end), channel);
			const headers = new Headers(requestInit?.headers);
			headers.set("Range", `bytes=${start}-${end - 1}`);
			const response = await fetch(src, { ...requestInit, headers });
			if (!response.ok) throw fetchError(src, response);
			let bytes = new Uint8Array(await response.arrayBuffer());
			// A server that ignores Range sends the whole file.
			if (response.status === 200) bytes = bytes.subarray(start, end);
			return readChannel(info, bytes, channel);
		},
	};
}

async function decodedSource(
	src: string,
	requestInit: RequestInit | undefined,
): Promise<WindowedSource> {
	const data = await getAudioData(src, requestInit === undefined ? {} : { requestInit });
	const frames = data.channelWaveforms[0]?.length ?? 0;
	return {
		sampleRate: data.sampleRate,
		numberOfChannels: data.numberOfChannels,
		durationInSeconds: data.durationInSeconds,
		frames,
		async read(channel, from, to) {
			return (data.channelWaveforms[channel] ?? new Float32Array(0)).slice(from, to);
		},
	};
}

async function open(src: string, requestInit: RequestInit | undefined): Promise<WindowedSource> {
	const headers = new Headers(requestInit?.headers);
	headers.set("Range", `bytes=0-${HEADER_BYTES - 1}`);
	const response = await fetch(src, { ...requestInit, headers });
	if (!response.ok) throw fetchError(src, response);
	const bytes = new Uint8Array(await response.arrayBuffer());
	const whole = response.status === 200 ? bytes : null;
	const info = parseWavHeader(bytes, totalSize(response, bytes.byteLength));
	if (info !== null && info !== "incomplete" && isReadableWav(info)) {
		return wavSource(src, info, requestInit, whole);
	}
	// Other formats (and unusual WAV layouts) are decoded whole, at 48 kHz, then sliced.
	return decodedSource(src, requestInit);
}

const sources = new Map<string, Promise<WindowedSource>>();

/** Opens `src` for windowed reading; cached per `src` for the lifetime of the page. */
export function openWindowedSource(
	src: string,
	requestInit: RequestInit | undefined,
): Promise<WindowedSource> {
	const cached = sources.get(src);
	if (cached) return cached;
	const pending = open(src, requestInit);
	sources.set(src, pending);
	pending.catch(() => {
		if (sources.get(src) === pending) sources.delete(src);
	});
	return pending;
}
