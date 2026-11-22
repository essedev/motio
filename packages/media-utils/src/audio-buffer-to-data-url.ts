/** The subset of `AudioBuffer` that `audioBufferToDataUrl()` reads. */
export interface AudioBufferLike {
	readonly numberOfChannels: number;
	readonly length: number;
	readonly sampleRate: number;
	getChannelData(channel: number): Float32Array;
}

/** Encodes the buffer as a 32-bit float WAV file with interleaved channels. */
export function encodeWav(buffer: AudioBufferLike): Uint8Array {
	const channels = buffer.numberOfChannels;
	const bytesPerFrame = channels * 4;
	const dataLength = buffer.length * bytesPerFrame;
	const bytes = new Uint8Array(44 + dataLength);
	const view = new DataView(bytes.buffer);
	const ascii = (offset: number, text: string) => {
		for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
	};
	ascii(0, "RIFF");
	view.setUint32(4, 36 + dataLength, true);
	ascii(8, "WAVE");
	ascii(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 3, true); // IEEE float
	view.setUint16(22, channels, true);
	view.setUint32(24, buffer.sampleRate, true);
	view.setUint32(28, buffer.sampleRate * bytesPerFrame, true);
	view.setUint16(32, bytesPerFrame, true);
	view.setUint16(34, 32, true);
	ascii(36, "data");
	view.setUint32(40, dataLength, true);
	const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
	let offset = 44;
	for (let i = 0; i < buffer.length; i++) {
		for (const channel of data) {
			view.setFloat32(offset, channel[i] as number, true);
			offset += 4;
		}
	}
	return bytes;
}

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

/**
 * Converts an `AudioBuffer` to a `data:audio/wav;base64,...` URL (32-bit float WAV, samples kept
 * as they are, without clipping), usable as the `src` of `<Audio>`.
 */
export function audioBufferToDataUrl(buffer: AudioBufferLike): string {
	return `data:audio/wav;base64,${toBase64(encodeWav(buffer))}`;
}
