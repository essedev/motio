// Page-side probe shared by the media-utils oracle recorder and Motio's browser test. It runs one
// implementation of the media-utils API (passed in, never imported) over the fixture grid and
// returns plain JSON. Both sides bundle this file, so the grid and the serialization are identical.

/** Decoded audio as the API returns it. */
interface AudioData {
	channelWaveforms: Float32Array[];
	sampleRate: number;
	durationInSeconds: number;
	numberOfChannels: number;
	resultId: string;
	isRemote: boolean;
}

type Loose = (...args: never[]) => unknown;

/** The media-utils API under test plus the React pieces the hook probes need. */
export interface ProbeApi {
	M: Record<string, Loose>;
	React: { createElement(type: unknown, props?: unknown, ...children: unknown[]): unknown };
	createRoot(el: Element): { render(node: unknown): void; unmount(): void };
	flushSync(fn: () => void): void;
}

/** Audio fixtures, as server paths. */
export const AUDIO = [
	"/sweep.wav",
	"/noise.wav",
	"/stereo.wav",
	"/silent.wav",
	"/tone.wav",
	"/tone.mp3",
	"/video-audio.mp4",
	"/m/clicks.wav",
] as const;

/** Windowed hook scenarios: source, window length, channel, frames visited in order (30 fps). */
export const WINDOWED = [
	{ src: "/m/clicks.wav", windowInSeconds: 1, channelIndex: 0, frames: [0, 30, 60, 90, 119] },
	{
		src: "/m/clicks.wav",
		windowInSeconds: 0.7,
		channelIndex: 0,
		frames: [0, 21, 42, 63, 100, 119],
	},
	{ src: "/stereo.wav", windowInSeconds: 0.5, channelIndex: 1, frames: [0, 15, 30, 44] },
	{ src: "/sweep.wav", windowInSeconds: 0.3, channelIndex: 0, frames: [0, 9, 30, 59] },
	{ src: "/tone.mp3", windowInSeconds: 1, channelIndex: 0, frames: [0, 40, 89] },
] as const;

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function sha256(bytes: ArrayBuffer | Uint8Array): Promise<string> {
	const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	const digest = await crypto.subtle.digest("SHA-256", view.slice().buffer);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function floatBytes(a: Float32Array): Uint8Array {
	return new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
}

/** Exact fingerprint of a waveform: length, SHA-256 of its bytes and a few readable values. */
async function fingerprint(a: Float32Array) {
	let sumAbs = 0;
	for (const v of a) sumAbs += Math.abs(v);
	return {
		length: a.length,
		sha256: await sha256(floatBytes(a)),
		sumAbs,
		head: Array.from(a.subarray(0, 4)),
		tail: Array.from(a.subarray(Math.max(0, a.length - 4))),
	};
}

async function describe(data: AudioData) {
	return {
		sampleRate: data.sampleRate,
		durationInSeconds: data.durationInSeconds,
		numberOfChannels: data.numberOfChannels,
		isRemote: data.isRemote,
		resultIdType: typeof data.resultId,
		keys: Object.keys(data).sort(),
		channels: await Promise.all(data.channelWaveforms.map(fingerprint)),
	};
}

function errorOf(e: unknown) {
	if (e instanceof Error) return { error: e.message, name: e.name };
	if (e instanceof Event) return { error: `Event ${e.type}`, name: "Event" };
	return { error: String(e), name: typeof e };
}

async function settle<T>(p: Promise<T> | T): Promise<{ ok: T } | ReturnType<typeof errorOf>> {
	try {
		return { ok: await p };
	} catch (e) {
		return errorOf(e);
	}
}

function sync<T>(fn: () => T): { ok: T } | ReturnType<typeof errorOf> {
	try {
		return { ok: fn() };
	} catch (e) {
		return errorOf(e);
	}
}

function lcg(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1103515245) + 12345) >>> 0;
		return s / 4294967296;
	};
}

/** Point lists for createSmoothSvgPath(). */
export function svgCases(): { x: number; y: number }[][] {
	const rnd = lcg(7);
	const random = Array.from({ length: 30 }, () => ({
		x: Math.round(rnd() * 100000) / 100,
		y: (rnd() - 0.5) * 777,
	}));
	return [
		[],
		[{ x: 1, y: 2 }],
		[
			{ x: 0, y: 0 },
			{ x: 100, y: 100 },
		],
		[
			{ x: 0, y: 0 },
			{ x: 100, y: 100 },
			{ x: 200, y: 50 },
			{ x: 300, y: 150 },
		],
		[
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 20, y: 0 },
		],
		[
			{ x: 5, y: 5 },
			{ x: 5, y: 5 },
			{ x: 9, y: -3 },
		],
		[
			{ x: 0.1, y: 0.3 },
			{ x: 1 / 3, y: 2 / 3 },
			{ x: 2, y: -5 },
			{ x: -1e-7, y: 1e21 },
		],
		random,
	];
}

function syntheticAudio(seed: number, length: number, sampleRate: number, channels = 1): AudioData {
	const rnd = lcg(seed);
	const channelWaveforms = Array.from({ length: channels }, () =>
		Float32Array.from({ length }, () => (rnd() * 2 - 1) * 0.7),
	);
	return {
		channelWaveforms,
		sampleRate,
		durationInSeconds: length / sampleRate,
		numberOfChannels: channels,
		resultId: `synthetic-${seed}-${length}-${sampleRate}-${channels}`,
		isRemote: false,
	};
}

/** Runs the whole grid. `other` is a second origin serving the same files with CORS. */
export async function runProbe(api: ProbeApi, other: string) {
	const { M } = api;
	const call = <T>(name: string, ...args: unknown[]) =>
		(M[name] as unknown as (...a: unknown[]) => T)(...args);

	// getAudioData: every fixture, decoding options, errors, caching and isRemote.
	const decoded: Record<string, AudioData> = {};
	const getAudioData: Record<string, unknown> = {};
	for (const src of [...AUDIO, "/m/stamp-30.mp4", "/missing.wav", "/image.png"]) {
		const r = await settle(call<Promise<AudioData>>("getAudioData", src));
		if ("ok" in r) {
			decoded[src] = r.ok;
			getAudioData[src] = await describe(r.ok);
		} else getAudioData[src] = r;
	}
	const variants: [string, string, unknown][] = [
		["sweep@44100", "/sweep.wav", { sampleRate: 44100 }],
		["stereo@8000", "/stereo.wav", { sampleRate: 8000 }],
		["tone.mp3@22050", "/tone.mp3", { sampleRate: 22050 }],
		["noise@96000", "/noise.wav", { sampleRate: 96000 }],
	];
	for (const [name, src, options] of variants) {
		const r = await settle(call<Promise<AudioData>>("getAudioData", src, options));
		getAudioData[name] = "ok" in r ? await describe(r.ok) : r;
	}
	const noise = decoded["/noise.wav"] as AudioData;
	const again = await call<Promise<AudioData>>("getAudioData", "/noise.wav");
	const explicit = await call<Promise<AudioData>>("getAudioData", "/noise.wav", {
		sampleRate: 48000,
	});
	const otherRate = await call<Promise<AudioData>>("getAudioData", "/noise.wav", {
		sampleRate: 44100,
	});
	const caching = {
		sameObjectAgain: again === noise,
		sameResultIdAgain: again.resultId === noise.resultId,
		explicit48000SharesCache: explicit.resultId === noise.resultId,
		otherRateHasOwnEntry: otherRate.resultId !== noise.resultId,
	};
	const blob = await (await fetch("/noise.wav")).blob();
	const head = new Uint8Array(await blob.slice(0, 4000).arrayBuffer());
	const dataUrl = `data:audio/wav;base64,${btoa(String.fromCharCode(...head))}`;
	const remoteOf = async (src: string, init?: unknown) => {
		const r = await settle(
			call<Promise<AudioData>>("getAudioData", src, init === undefined ? undefined : init),
		);
		return "ok" in r ? r.ok.isRemote : r;
	};
	const isRemote = {
		relative: (decoded["/stereo.wav"] as AudioData).isRemote,
		absoluteSameOrigin: await remoteOf(`${location.origin}/stereo.wav`),
		otherOrigin: await remoteOf(`${other}/stereo.wav`),
		protocolRelative: await remoteOf(`//${location.host}/sweep.wav`),
		blob: await remoteOf(URL.createObjectURL(blob)),
		data: await remoteOf(dataUrl),
	};
	// The server logs this header; the test checks it reached the server.
	await settle(
		call<Promise<AudioData>>("getAudioData", "/tone.wav", {
			sampleRate: 16000,
			requestInit: { headers: { "x-motio-probe": "request-init" } },
		}),
	);

	// visualizeAudio over the decoded fixtures.
	const visualizeAudio: unknown[] = [];
	for (const src of AUDIO) {
		const audioData = decoded[src] as AudioData;
		const last = Math.floor(audioData.durationInSeconds * 30);
		const frames = [0, 1, 2, 7, 15, 31, 44, last - 1, last + 5];
		for (const frame of frames) {
			for (const numberOfSamples of [1, 8, 64]) {
				for (const smoothing of [true, false]) {
					const options = { audioData, frame, fps: 30, numberOfSamples, smoothing };
					visualizeAudio.push({
						src,
						frame,
						fps: 30,
						numberOfSamples,
						smoothing,
						...sync(() => call("visualizeAudio", options)),
					});
				}
			}
			const speed = { audioData, frame, fps: 30, numberOfSamples: 64, optimizeFor: "speed" };
			visualizeAudio.push({
				src,
				frame,
				fps: 30,
				numberOfSamples: 64,
				optimizeFor: "speed",
				...sync(() => call("visualizeAudio", speed)),
			});
		}
		for (const [frame, fps] of [
			[10, 30],
			[20, 29.97],
			[13, 25],
			[61, 60],
		] as const) {
			for (const optimizeFor of ["accuracy", "speed"]) {
				const options = { audioData, frame, fps, numberOfSamples: 512, optimizeFor };
				visualizeAudio.push({
					src,
					frame,
					fps,
					numberOfSamples: 512,
					optimizeFor,
					...sync(() => call("visualizeAudio", options)),
				});
			}
		}
		for (const frame of [30, 40]) {
			const options = { audioData, frame, fps: 30, numberOfSamples: 32, dataOffsetInSeconds: 0.5 };
			visualizeAudio.push({
				src,
				frame,
				fps: 30,
				numberOfSamples: 32,
				dataOffsetInSeconds: 0.5,
				...sync(() => call("visualizeAudio", options)),
			});
		}
	}

	// getWaveformPortion over the decoded fixtures.
	const getWaveformPortion: unknown[] = [];
	for (const src of AUDIO) {
		const audioData = decoded[src] as AudioData;
		const d = audioData.durationInSeconds;
		const lastChannel = audioData.numberOfChannels - 1;
		const grid: Record<string, unknown>[] = [
			{ startTimeInSeconds: 0, durationInSeconds: 1, numberOfSamples: 10 },
			{ startTimeInSeconds: 0.3, durationInSeconds: 0.5, numberOfSamples: 7, normalize: false },
			{
				startTimeInSeconds: 0.123,
				durationInSeconds: 0.777,
				numberOfSamples: 33,
				outputRange: "minus-one-to-one",
			},
			{
				startTimeInSeconds: 0.123,
				durationInSeconds: 0.777,
				numberOfSamples: 33,
				outputRange: "zero-to-one",
				normalize: false,
			},
			{ startTimeInSeconds: -0.2, durationInSeconds: 0.5, numberOfSamples: 5 },
			{ startTimeInSeconds: d - 0.3, durationInSeconds: 1, numberOfSamples: 8, normalize: false },
			{
				startTimeInSeconds: 0.5,
				durationInSeconds: 0.25,
				numberOfSamples: 100,
				channel: lastChannel,
			},
			{
				startTimeInSeconds: 0.75,
				durationInSeconds: 0.5,
				numberOfSamples: 12,
				dataOffsetInSeconds: 0.25,
			},
			{ startTimeInSeconds: 0, durationInSeconds: 0.00001, numberOfSamples: 3 },
			{ startTimeInSeconds: 0.01, durationInSeconds: d, numberOfSamples: 1000, normalize: false },
		];
		for (const g of grid) {
			const r = sync(() =>
				call<{ index: number; amplitude: number }[]>("getWaveformPortion", { audioData, ...g }),
			);
			getWaveformPortion.push({ src, ...g, ...r });
		}
	}

	// visualizeAudioWaveform over the decoded fixtures.
	const visualizeAudioWaveform: unknown[] = [];
	for (const src of AUDIO) {
		const audioData = decoded[src] as AudioData;
		const lastChannel = audioData.numberOfChannels - 1;
		for (const frame of [0, 10, 25, 44]) {
			const grid: Record<string, unknown>[] = [
				{ numberOfSamples: 16, windowInSeconds: 1 / 30 },
				{ numberOfSamples: 64, windowInSeconds: 0.25, normalize: true },
				{
					numberOfSamples: 5,
					windowInSeconds: 0.5,
					channel: lastChannel,
					dataOffsetInSeconds: 0.1,
				},
			];
			for (const g of grid) {
				const r = sync(() => call("visualizeAudioWaveform", { audioData, frame, fps: 30, ...g }));
				visualizeAudioWaveform.push({ src, frame, fps: 30, ...g, ...r });
			}
		}
	}

	// Synthetic data: edge cases and errors, independent of decoding.
	const synth = syntheticAudio(3, 3000, 1000, 2);
	const zeros: AudioData = {
		...syntheticAudio(4, 1000, 1000),
		channelWaveforms: [new Float32Array(1000)],
		resultId: "synthetic-zeros",
	};
	const synthetic = {
		visualizeAudio: [
			{ numberOfSamples: 3 },
			{ numberOfSamples: 0 },
			{ numberOfSamples: 1.5 },
			{ numberOfSamples: -2 },
			{ numberOfSamples: 2048 },
			{ numberOfSamples: 1024 },
			{ numberOfSamples: 8, frame: 0 },
			{ numberOfSamples: 8, frame: 1000 },
			{ numberOfSamples: 16, fps: 7, frame: 20 },
			{ numberOfSamples: 16, fps: 29.97, frame: 33, smoothing: false },
			{ numberOfSamples: 4, dataOffsetInSeconds: 0.0123, frame: 40 },
		].map((o) => ({
			...o,
			...sync(() => call("visualizeAudio", { audioData: synth, frame: 10, fps: 30, ...o })),
		})),
		visualizeAudioZeros: sync(() =>
			call("visualizeAudio", { audioData: zeros, frame: 10, fps: 30, numberOfSamples: 4 }),
		),
		visualizeAudioWaveform: [
			{ numberOfSamples: 4, windowInSeconds: 0.003 },
			{ numberOfSamples: 4, windowInSeconds: 0.004 },
			{ numberOfSamples: 4, windowInSeconds: 0.5, channel: 2 },
			{ numberOfSamples: 4, windowInSeconds: 0.5, channel: -1 },
			{ numberOfSamples: 7, windowInSeconds: 0.1, frame: 0, normalize: true },
		].map((o) => ({
			...o,
			...sync(() => call("visualizeAudioWaveform", { audioData: synth, frame: 30, fps: 30, ...o })),
		})),
		getWaveformPortion: [
			{ channel: -1 },
			{ channel: 2 },
			{ durationInSeconds: -1 },
			{ durationInSeconds: 0.005, numberOfSamples: 6 },
			{ numberOfSamples: 0 },
			{ startTimeInSeconds: 5, normalize: true },
			{ startTimeInSeconds: 5, normalize: true, outputRange: "minus-one-to-one" },
		].map((o) => ({
			...o,
			...sync(() =>
				call("getWaveformPortion", {
					audioData: synth,
					startTimeInSeconds: 1,
					durationInSeconds: 1,
					numberOfSamples: 5,
					...o,
				}),
			),
		})),
	};

	const createSmoothSvgPath = svgCases().map((points) =>
		sync(() => call<string>("createSmoothSvgPath", { points })),
	);

	// audioBufferToDataUrl: small synthetic buffers in full, a decoded file by hash.
	const buffer = (
		channels: number,
		length: number,
		sampleRate: number,
		fn: (c: number, i: number) => number,
	) => {
		const b = new AudioBuffer({ numberOfChannels: channels, length, sampleRate });
		for (let c = 0; c < channels; c++) {
			const d = b.getChannelData(c);
			for (let i = 0; i < length; i++) d[i] = fn(c, i);
		}
		return b;
	};
	const stereoFile = await (await fetch("/stereo.wav")).arrayBuffer();
	const decodedBuffer = await new OfflineAudioContext({
		numberOfChannels: 1,
		length: 1,
		sampleRate: 44100,
	}).decodeAudioData(stereoFile);
	const longUrl = call<string>("audioBufferToDataUrl", decodedBuffer);
	const audioBufferToDataUrl = {
		empty: call<string>("audioBufferToDataUrl", new AudioBuffer({ length: 1, sampleRate: 44100 })),
		mono: call<string>(
			"audioBufferToDataUrl",
			buffer(1, 4, 8000, (_c, i) => [0, 0.5, -0.5, 1][i] ?? 0),
		),
		stereo: call<string>(
			"audioBufferToDataUrl",
			buffer(2, 3, 22050, (c, i) => (c === 0 ? [0.25, -1, 2][i] : [-0.75, 0.1, -2][i]) ?? 0),
		),
		three: call<string>(
			"audioBufferToDataUrl",
			buffer(3, 2, 48000, (c, i) => c * 0.1 + i * 0.01),
		),
		decodedLength: longUrl.length,
		decodedSha256: await sha256(new TextEncoder().encode(longUrl)),
	};

	// Media element based metadata and image dimensions.
	const durations: Record<string, unknown> = {};
	for (const src of [
		"/sweep.wav",
		"/tone.mp3",
		"/video-audio.mp4",
		"/m/stamp-30.mp4",
		"/missing.wav",
		"/image.png",
	]) {
		durations[src] = await settle(call("getAudioDurationInSeconds", src));
	}
	durations.alias = await settle(call("getAudioDuration", "/noise.wav"));
	durations.dataUrl = await settle(call("getAudioDurationInSeconds", audioBufferToDataUrl.mono));
	const videoMetadata: Record<string, unknown> = {};
	for (const src of [
		"/video-audio.mp4",
		"/m/stamp-30.mp4",
		"/sweep.wav",
		"/missing.wav",
		"/image.png",
		`${location.origin}/video-audio.mp4`,
	]) {
		videoMetadata[src.replace(location.origin, "<origin>")] = await settle(
			call("getVideoMetadata", src),
		);
	}
	videoMetadata["<other>/m/stamp-24.mp4"] = await settle(
		call("getVideoMetadata", `${other}/m/stamp-24.mp4`),
	);
	const imageDimensions: Record<string, unknown> = {};
	for (const src of ["/image.png", "/image.jpg", "/image.svg", "/f/photo.png"]) {
		imageDimensions[src] = await settle(call("getImageDimensions", src));
	}
	imageDimensions["<other>/image.png"] = await settle(
		call("getImageDimensions", `${other}/image.png`),
	);
	for (const src of ["/missing.png", "/sweep.wav"]) {
		const r = await settle(call("getImageDimensions", src));
		imageDimensions[src] = { rejected: !("ok" in r) };
	}

	return {
		getAudioData,
		caching,
		isRemote,
		visualizeAudio,
		getWaveformPortion,
		visualizeAudioWaveform,
		synthetic,
		createSmoothSvgPath,
		audioBufferToDataUrl,
		durations,
		videoMetadata,
		imageDimensions,
		useAudioData: await probeUseAudioData(api),
		useWindowedAudioData: await probeWindowed(api),
	};
}

async function probeUseAudioData(api: ProbeApi) {
	const { React, createRoot, flushSync, M } = api;
	let latest: AudioData | null = null;
	const Hook = (props: { src: string; options?: unknown }) => {
		latest = (M.useAudioData as unknown as (s: string, o?: unknown) => AudioData | null)(
			props.src,
			props.options,
		);
		return null;
	};
	const el = document.createElement("div");
	document.body.append(el);
	const root = createRoot(el);
	const render = (props: { src: string; options?: unknown }) =>
		flushSync(() => root.render(React.createElement(Hook, props)));
	const snapshot = () =>
		latest === null
			? null
			: {
					sampleRate: latest.sampleRate,
					durationInSeconds: latest.durationInSeconds,
					numberOfChannels: latest.numberOfChannels,
				};
	const waitFor = async (fn: () => boolean) => {
		for (let i = 0; i < 200 && !fn(); i++) await sleep(10);
	};
	const steps: unknown[] = [];
	render({ src: "/sweep.wav" });
	steps.push({ step: "first render", value: snapshot() });
	await waitFor(() => latest !== null);
	const fromHook = latest as AudioData | null;
	const direct = await (M.getAudioData as unknown as (s: string) => Promise<AudioData>)(
		"/sweep.wav",
	);
	steps.push({ step: "loaded", value: snapshot(), sameAsGetAudioData: fromHook === direct });
	render({ src: "/sweep.wav", options: { sampleRate: 8000 } });
	steps.push({ step: "sampleRate changed", value: snapshot() });
	await waitFor(() => latest?.sampleRate === 8000);
	steps.push({ step: "sampleRate loaded", value: snapshot() });
	render({ src: "/stereo.wav", options: { sampleRate: 8000 } });
	steps.push({ step: "src changed", value: snapshot() });
	await waitFor(() => latest?.numberOfChannels === 2);
	steps.push({ step: "src loaded", value: snapshot() });
	root.unmount();
	el.remove();
	return steps;
}

async function probeWindowed(api: ProbeApi) {
	const { React, createRoot, flushSync, M } = api;
	type Ret = { audioData: AudioData | null; dataOffsetInSeconds: number };
	let latest: Ret | null = null;
	const Hook = (props: Record<string, unknown>) => {
		latest = (M.useWindowedAudioData as unknown as (p: unknown) => Ret)(props);
		return null;
	};
	const out: unknown[] = [];
	for (const scenario of WINDOWED) {
		const el = document.createElement("div");
		document.body.append(el);
		const root = createRoot(el);
		latest = null;
		for (const frame of scenario.frames) {
			const props = {
				src: scenario.src,
				frame,
				fps: 30,
				windowInSeconds: scenario.windowInSeconds,
				channelIndex: scenario.channelIndex,
			};
			flushSync(() => root.render(React.createElement(Hook, props)));
			const immediate = latest as Ret | null;
			const immediateId = immediate?.audioData?.resultId ?? null;
			// Wait until the returned windows are the previous, current and next one.
			for (let i = 0; i < 200; i++) {
				const data = (latest as Ret | null)?.audioData;
				if (data) {
					const count = Math.ceil(data.durationInSeconds / scenario.windowInSeconds);
					const current = Math.floor(frame / 30 / scenario.windowInSeconds);
					const wanted = [current - 1, current, current + 1].filter((w) => w >= 0 && w < count);
					if (data.resultId === `${scenario.src}-windows-${wanted.join(",")}`) break;
				}
				await sleep(10);
			}
			const r = latest as Ret | null;
			const audioData = r?.audioData ?? null;
			const values = audioData
				? {
						visualizeAudio: sync(() =>
							(M.visualizeAudio as unknown as (o: unknown) => number[])({
								audioData,
								frame,
								fps: 30,
								numberOfSamples: 16,
								dataOffsetInSeconds: r?.dataOffsetInSeconds,
							}),
						),
						visualizeAudioWaveform: sync(() =>
							(M.visualizeAudioWaveform as unknown as (o: unknown) => number[])({
								audioData,
								frame,
								fps: 30,
								numberOfSamples: 8,
								windowInSeconds: 0.1,
								dataOffsetInSeconds: r?.dataOffsetInSeconds,
							}),
						),
					}
				: null;
			out.push({
				...scenario,
				frames: undefined,
				frame,
				immediateResultId: immediateId,
				resultId: audioData?.resultId ?? null,
				dataOffsetInSeconds: r?.dataOffsetInSeconds ?? null,
				sampleRate: audioData?.sampleRate ?? null,
				durationInSeconds: audioData?.durationInSeconds ?? null,
				numberOfChannels: audioData?.numberOfChannels ?? null,
				length: audioData?.channelWaveforms[0]?.length ?? null,
				isRemote: audioData?.isRemote ?? null,
				...values,
			});
		}
		root.unmount();
		el.remove();
	}
	return out;
}
