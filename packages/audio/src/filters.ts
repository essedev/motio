/**
 * FFmpeg `atempo` accepts factors in [0.5, 100], and quality drops above 2, so a rate is
 * split into stages of at most 2 (or at least 0.5) whose product is the requested rate.
 */
export function atempoChain(rate: number): number[] {
	if (!Number.isFinite(rate) || rate <= 0) {
		throw new RangeError(`playback rate must be a positive finite number, got ${rate}`);
	}
	if (rate === 1) return [];
	const stages: number[] = [];
	let rest = rate;
	while (rest > 2) {
		stages.push(2);
		rest /= 2;
	}
	while (rest < 0.5) {
		stages.push(0.5);
		rest /= 0.5;
	}
	stages.push(rest);
	return stages;
}

/**
 * The filter chain that turns a source into the samples to place on the timeline: trim, then
 * pitch shift (`toneFrequency`, as a sample-rate change compensated in tempo), then tempo
 * (`playbackRate`, pitch preserved; or, with `preservePitch: false`, a sample-rate change so
 * the pitch follows the rate), then resampling to the mix rate.
 */
export function sourceFilter(options: {
	trimSeconds: number;
	playbackRate: number;
	toneFrequency: number;
	sampleRate: number;
	preservePitch?: boolean;
}): string {
	const { trimSeconds, playbackRate, toneFrequency, sampleRate } = options;
	if (!Number.isFinite(playbackRate) || playbackRate <= 0) {
		throw new RangeError(`playback rate must be a positive finite number, got ${playbackRate}`);
	}
	if (!Number.isFinite(toneFrequency) || toneFrequency <= 0) {
		throw new RangeError(`toneFrequency must be a positive finite number, got ${toneFrequency}`);
	}
	const parts: string[] = [];
	if (trimSeconds > 0) parts.push(`atrim=start=${trimSeconds}`, "asetpts=PTS-STARTPTS");
	parts.push(`aresample=${sampleRate}`);
	if (toneFrequency !== 1) {
		parts.push(`asetrate=${Math.round(sampleRate * toneFrequency)}`, `aresample=${sampleRate}`);
		for (const s of atempoChain(1 / toneFrequency)) parts.push(`atempo=${s}`);
	}
	if (options.preservePitch === false) {
		if (playbackRate !== 1) {
			parts.push(`asetrate=${Math.round(sampleRate * playbackRate)}`, `aresample=${sampleRate}`);
		}
	} else {
		for (const s of atempoChain(playbackRate)) parts.push(`atempo=${s}`);
	}
	return parts.join(",");
}
