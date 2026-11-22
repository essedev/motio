/** Layout of the PCM data of a WAV file. */
export interface WavInfo {
	/** 1 integer PCM, 3 IEEE float. */
	format: 1 | 3;
	numberOfChannels: number;
	sampleRate: number;
	bitsPerSample: number;
	/** Byte offset of the first sample. */
	dataOffset: number;
	/** Number of sample frames (one sample per channel). */
	frames: number;
}

const WAVE_FORMAT_EXTENSIBLE = 0xfffe;

function ascii(view: DataView, offset: number, length: number): string {
	let out = "";
	for (let i = 0; i < length; i++) out += String.fromCharCode(view.getUint8(offset + i));
	return out;
}

/**
 * Parses the header of a RIFF WAVE file from its first bytes. Returns null when the bytes are not
 * a WAV file, or "incomplete" when the data chunk starts beyond them. `fileSize` bounds a data
 * chunk whose declared size is missing or too large (streamed files).
 */
export function parseWavHeader(bytes: Uint8Array, fileSize: number): WavInfo | null | "incomplete" {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (bytes.byteLength < 12) return "incomplete";
	if (ascii(view, 0, 4) !== "RIFF" || ascii(view, 8, 4) !== "WAVE") return null;
	let offset = 12;
	let fmt: Omit<WavInfo, "dataOffset" | "frames"> | null = null;
	while (offset + 8 <= bytes.byteLength) {
		const id = ascii(view, offset, 4);
		const size = view.getUint32(offset + 4, true);
		const body = offset + 8;
		if (id === "fmt ") {
			if (body + 16 > bytes.byteLength) return "incomplete";
			let format = view.getUint16(body, true);
			const numberOfChannels = view.getUint16(body + 2, true);
			const sampleRate = view.getUint32(body + 4, true);
			const bitsPerSample = view.getUint16(body + 14, true);
			if (format === WAVE_FORMAT_EXTENSIBLE) {
				if (body + 26 > bytes.byteLength) return "incomplete";
				format = view.getUint16(body + 24, true);
			}
			if (format !== 1 && format !== 3) return null;
			fmt = { format, numberOfChannels, sampleRate, bitsPerSample };
		} else if (id === "data") {
			if (fmt === null) return null;
			const blockAlign = (fmt.bitsPerSample / 8) * fmt.numberOfChannels;
			const available = Math.max(0, fileSize - body);
			const length = size === 0 || size > available ? available : size;
			return { ...fmt, dataOffset: body, frames: Math.floor(length / blockAlign) };
		}
		offset = body + size + (size % 2);
	}
	return "incomplete";
}

/** Converts interleaved PCM bytes to the float samples of one channel. */
export function readChannel(info: WavInfo, bytes: Uint8Array, channel: number): Float32Array {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const bytesPerSample = info.bitsPerSample / 8;
	const blockAlign = bytesPerSample * info.numberOfChannels;
	const frames = Math.floor(bytes.byteLength / blockAlign);
	const out = new Float32Array(frames);
	for (let i = 0; i < frames; i++) {
		const at = i * blockAlign + channel * bytesPerSample;
		if (info.format === 3) {
			out[i] = info.bitsPerSample === 64 ? view.getFloat64(at, true) : view.getFloat32(at, true);
		} else if (info.bitsPerSample === 8) {
			out[i] = (view.getUint8(at) - 128) / 128;
		} else if (info.bitsPerSample === 16) {
			out[i] = view.getInt16(at, true) / 32768;
		} else if (info.bitsPerSample === 24) {
			const v = view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getInt8(at + 2) << 16);
			out[i] = v / 8388608;
		} else {
			out[i] = view.getInt32(at, true) / 2147483648;
		}
	}
	return out;
}

/** Whether a WAV layout can be read sample by sample by `readChannel()`. */
export function isReadableWav(info: WavInfo): boolean {
	return info.format === 3
		? info.bitsPerSample === 32 || info.bitsPerSample === 64
		: [8, 16, 24, 32].includes(info.bitsPerSample);
}
