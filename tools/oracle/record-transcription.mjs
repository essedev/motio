// Records the pure functions of the published transcription packages over grids of inputs:
// toCaptions() of @remotion/install-whisper-cpp, openAiWhisperApiToCaptions() and
// isOpenAiWhisperTranscript() of @remotion/openai-whisper, elevenLabsTranscriptToCaptions() and
// detectElevenLabsTranscriptFormat() of @remotion/elevenlabs. Inputs are documented shapes,
// hand-picked edge cases and seeded random ones; no API is called. Public API only.
// Values JSON cannot hold are written as {"$": "NaN" | "Infinity" | "-Infinity" | "undefined"}.
// Writes packages/{install-whisper-cpp,openai-whisper,elevenlabs}/src/__oracle__/*.json.
// Usage: pnpm record:transcription
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	detectElevenLabsTranscriptFormat,
	elevenLabsTranscriptToCaptions,
} from "@remotion/elevenlabs";
import { toCaptions } from "@remotion/install-whisper-cpp";
import { isOpenAiWhisperTranscript, openAiWhisperApiToCaptions } from "@remotion/openai-whisper";

const here = import.meta.dirname;
const root = join(here, "../..");
const version = JSON.parse(readFileSync(join(here, "package.json"), "utf8")).dependencies[
	"@remotion/openai-whisper"
];

const encode = (value) =>
	JSON.stringify(value, (_key, v) => {
		if (v === undefined) return { $: "undefined" };
		if (typeof v === "number" && !Number.isFinite(v)) return { $: String(v) };
		return v;
	});
// Undefined inside arrays and objects survives only through the marker above.
const clone = (value) => JSON.parse(encode(value));

let seed = 20261123;
const random = () => {
	seed = (seed * 16807) % 2147483647;
	return seed / 2147483647;
};
const pick = (list) => list[Math.floor(random() * list.length)];
const int = (n) => Math.floor(random() * n);

function record(call, input) {
	try {
		return { input: clone(input), output: clone(call(input)) };
	} catch (error) {
		return {
			input: clone(input),
			error: String(error?.message ?? error),
			errorType:
				error instanceof TypeError ? "TypeError" : error instanceof Error ? "Error" : typeof error,
		};
	}
}

const BAD = [
	{ $: "undefined" },
	null,
	"1",
	-1,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	true,
	[],
	{},
	0,
	1.5,
];
const decodeBad = (v) =>
	v && typeof v === "object" && "$" in v ? (v.$ === "undefined" ? undefined : Number(v.$)) : v;
const withField = (object, key, value) => {
	const copy = { ...object };
	if (value === undefined) delete copy[key];
	else copy[key] = value;
	return copy;
};

// toCaptions(): transcribe() output with token-level timestamps.
const token = (text, p, t_dtw, from = 0, to = 0) => ({
	text,
	timestamps: { from: "00:00:00,000", to: "00:00:00,000" },
	offsets: { from, to },
	id: 1,
	p,
	t_dtw,
});
const item = (text, from, to, tokens) => ({
	timestamps: { from: "00:00:00,000", to: "00:00:00,000" },
	offsets: { from, to },
	text,
	tokens,
});
const whisperOutput = (transcription) => ({
	systeminfo: "",
	model: { type: "tiny" },
	params: { model: "ggml-tiny.en.bin", language: "en", translate: false },
	result: { language: "en" },
	transcription,
});
const real = JSON.parse(readFileSync(join(here, "fixtures/jfk-transcription.json"), "utf8"));
const toCaptionsInputs = [
	...real.map((r) => ({ whisperCppOutput: r })),
	{ whisperCppOutput: whisperOutput([]) },
	{
		whisperCppOutput: whisperOutput([
			item(" Hello", 0, 100, [token(" Hello", 0.5, 7)]),
			item(" world", 100, 200, [token(" world", 0.6, 15)]),
		]),
	},
	{
		whisperCppOutput: whisperOutput([
			item("", 0, 10, [token("[_BEG_]", 0.9, -1)]),
			item(" Hi", 10, 20, [token(" Hi", 0.3, 2)]),
		]),
	},
	{
		whisperCppOutput: whisperOutput([
			item(" Hello", 0, 100, [
				token("[_TT_1]", 0.1, -1),
				token(" Hel", 0.5, 3),
				token("lo", 0.7, 9),
			]),
		]),
	},
	{
		whisperCppOutput: whisperOutput([
			item(" you", 0, 100, [token(" you", 0.9, 5), token("[_TT_2]", 0.01, -1)]),
		]),
	},
	{
		whisperCppOutput: whisperOutput([
			item(" a", 0, 1, [token(" a", 1, 1)]),
			item("", 1, 2, [token("[_TT_]", 1, -1)]),
			item(" b", 2, 3, [token(" b", 1, 2)]),
		]),
	},
	{
		whisperCppOutput: whisperOutput([
			item(" ", 0, 1, [token(" ", 1, 1)]),
			item(" b", 2, 3, [token(" b", 1, 2)]),
		]),
	},
	{
		whisperCppOutput: whisperOutput([
			item("Hi ", 0, 1, [token("Hi", 1, 1)]),
			item("  b ", 2, 3, [token("  b ", 1, 2)]),
		]),
	},
	{ whisperCppOutput: whisperOutput([item("\t\nHi", 0, 1, [token("x", 1, 1)])]) },
	{
		whisperCppOutput: whisperOutput([
			item(" a", 0, 1, [token(" a", 1, 0)]),
			item(" b", 1, 2, [token(" b", 1, -2)]),
			item(" c", 2, 3, [token(" c", 1, 12.345)]),
		]),
	},
	{ whisperCppOutput: whisperOutput([item(" a", 0, 1, [{ t_dtw: 3 }])]) },
	{ whisperCppOutput: whisperOutput([item("[_TT_5]", 0, 1, [token("[_TT_5]", 1, -1)])]) },
	{
		whisperCppOutput: whisperOutput([
			item(" a", 0, 1, [token(" a", 0.2, -1), token("b", 0.4, 33)]),
		]),
	},
	{ whisperCppOutput: whisperOutput([item(" x", 0, 100, [])]) },
	{ whisperCppOutput: whisperOutput([item(" x", 0, 100, undefined)]) },
	{ whisperCppOutput: whisperOutput([{ text: " a", tokens: [token(" a", 1, 1)] }]) },
	{
		whisperCppOutput: whisperOutput([
			{ text: null, offsets: { from: 0, to: 1 }, tokens: [token(" a", 1, 1)] },
		]),
	},
	{
		whisperCppOutput: whisperOutput([
			{ text: 5, offsets: { from: 0, to: 1 }, tokens: [token(" a", 1, 1)] },
		]),
	},
	{
		whisperCppOutput: whisperOutput([
			item("", 0, 1, [token("", 1, 1)]),
			{ text: null, offsets: { from: 0, to: 1 }, tokens: [] },
		]),
	},
	{ whisperCppOutput: { transcription: "x" } },
	{ whisperCppOutput: {} },
	{},
];
for (let i = 0; i < 60; i++) {
	const items = [];
	let t = int(500);
	for (let j = int(8); j >= 0; j--) {
		const text = pick(["", " ", " word", "Word", ",", ".", " it's", "  two ", "\tx"]);
		const from = t;
		t += int(800);
		const tokens = Array.from({ length: 1 + int(3) }, () =>
			token(
				pick([text, "[_TT_9]", "[_BEG_]"]),
				Math.round(random() * 1e6) / 1e6,
				pick([-1, int(2000), int(2000) + 0.5]),
			),
		);
		items.push(item(text, from, t, tokens));
	}
	toCaptionsInputs.push({ whisperCppOutput: whisperOutput(items) });
}

// openAiWhisperApiToCaptions(): verbose_json responses.
const PUNCTUATION = `"'()[]{}‘’-*#@$%&.,:;!?/_~\`^+=<>|`;
const OTHER = "¿¡«»“”—…\\";
const BASE_WORDS = [
	"Hello",
	"world",
	"it's",
	"don't",
	"U.S.",
	"5",
	"50",
	"e",
	"mail",
	"the",
	"你好",
	"é",
	"x",
];
const openAiInputs = [
	{
		task: "transcribe",
		language: "english",
		duration: 3.2,
		text: "Hello, world! How are you?",
		words: [
			{ word: "Hello", start: 0, end: 0.5 },
			{ word: "world", start: 0.6, end: 1.1 },
			{ word: "How", start: 1.5, end: 1.7 },
			{ word: "are", start: 1.7, end: 1.9 },
			{ word: "you", start: 1.9, end: 2.2 },
		],
	},
	{
		task: "transcribe",
		language: "english",
		duration: 3,
		text: " Hello world. Bye.",
		segments: [
			{
				id: 0,
				seek: 0,
				start: 0,
				end: 1.5,
				text: " Hello world.",
				tokens: [1],
				temperature: 0,
				avg_logprob: -0.2,
				compression_ratio: 1,
				no_speech_prob: 0.1,
			},
			{
				id: 1,
				seek: 0,
				start: 1.5,
				end: 3,
				text: " Bye.",
				tokens: [2],
				temperature: 0,
				avg_logprob: -0.2,
				compression_ratio: 1,
				no_speech_prob: 0.1,
			},
		],
	},
	{ text: "Hi", words: [], segments: [{ start: 0, end: 1, text: "Hi" }] },
	{
		text: "Hi there",
		words: [
			{ word: "Hi", start: 0, end: 0.2 },
			{ word: "there", start: 0.3, end: 0.6 },
		],
		segments: [{ start: 0, end: 1, text: "Hi there" }],
	},
	{ text: "Hi" },
	{ text: "Hi", words: [], segments: [] },
	{ text: "x", segments: [{ start: 0, end: 1, text: "  spaced  " }] },
	"hello",
	null,
	[],
	42,
];
const words = (text, list, times) => ({
	text,
	words: list.map((w, i) => ({
		word: w,
		start: times ? times[i][0] : i,
		end: times ? times[i][1] : i + 1,
	})),
});
for (const [text, list] of [
	["Hello,world", ["Hello", "world"]],
	["Hello...?! there", ["Hello", "there"]],
	["Hello-there friend", ["Hello", "there", "friend"]],
	["a — b", ["a", "b"]],
	['x "(y', ["x", "y"]],
	["x y   ", ["x", "y"]],
	["   x", ["x"]],
	["x\ny", ["x", "y"]],
	["x\t y", ["x", "y"]],
	["xyz", ["x"]],
	["xyz w", ["x", "w"]],
	["ab", ["a", "b"]],
	["Hello, there", ["Hello,", "there"]],
	["a b", ["a", "", "b"]],
	["a b", ["a", " ", "b"]],
	["It costs $5.50.", ["It", "costs", "$5.50"]],
	["don’t stop", ["don't", "stop"]],
	["don't", ["don’t"]],
	["don’t", ["don‘t"]],
	["dont", ["don't"]],
	["x y", ["x", "Y"]],
	["HELLO world", ["hello", "World"]],
	["x ((y", ["x", "y"]],
	["x (((y", ["x", "y"]],
	["x ((((y", ["x", "y"]],
	["x  \n\t y", ["x", "y"]],
	["(((((x", ["x"]],
	["x.......y", ["x", "y"]],
	["U.S.A. is", ["U.S.A.", "is"]],
	["x é", ["x", "é"]],
	["x y", ["x", "y"]],
	["Hi.", ["Hi", "extra"]],
	["a b c d", ["a", "b"]],
	["a+b", ["a+b"]],
	["(a) [b]", ["(a)", "b"]],
	["a.b", ["a.b"]],
	["$x", ["x"]],
	["a\\b", ["a", "b"]],
]) {
	openAiInputs.push(words(text, list));
}
for (const ch of `${PUNCTUATION + OTHER}a1 `) {
	openAiInputs.push(words(`x${ch}`, ["x"]));
	openAiInputs.push(words(`x${ch} y`, ["x", "y"]));
	openAiInputs.push(words(`x ${ch}y`, ["x", "y"]));
}
for (let i = 0; i < 400; i++) {
	const list = Array.from({ length: 1 + int(6) }, () => pick(BASE_WORDS));
	let text = "";
	for (const w of list) {
		const rare = (list) => (random() < 0.04 ? pick([...OTHER, "z"]) : pick(list));
		const before = Array.from({ length: int(4) }, () =>
			rare([" ", " ", "\n", ...PUNCTUATION]),
		).join("");
		const after = Array.from({ length: int(5) }, () => rare([...PUNCTUATION])).join("");
		text += (text === "" ? "" : " ") + before + (random() < 0.1 ? w.replace("'", "’") : w) + after;
	}
	openAiInputs.push(words(random() < 0.05 ? text.toUpperCase() : text, list));
}
for (let i = 0; i < 150; i++) {
	const start =
		Math.floor(random() * 100000) / pick([1, 10, 100, 1000]) + (random() < 0.3 ? random() : 0);
	const end = start + random() * 3;
	openAiInputs.push(words("x", ["x"], [[start, end]]));
	openAiInputs.push({ text: "x", segments: [{ text: "x", start, end }] });
}
const okWords = {
	text: "a b",
	words: [
		{ word: "a", start: 0, end: 1 },
		{ word: "b", start: 1, end: 2 },
	],
};
const okSegments = { text: "a", segments: [{ text: "a", start: 0, end: 1 }] };
for (const raw of BAD) {
	const bad = decodeBad(raw);
	openAiInputs.push(withField(okWords, "text", bad));
	openAiInputs.push(withField(okWords, "words", bad));
	openAiInputs.push(withField(okSegments, "segments", bad));
	for (const key of ["word", "start", "end"]) {
		openAiInputs.push({
			...okWords,
			words: [okWords.words[0], withField(okWords.words[1], key, bad)],
		});
	}
	for (const key of ["text", "start", "end"]) {
		openAiInputs.push({ ...okSegments, segments: [withField(okSegments.segments[0], key, bad)] });
		openAiInputs.push({
			...okSegments,
			words: [],
			segments: [withField(okSegments.segments[0], key, bad)],
		});
	}
	openAiInputs.push({ ...okWords, segments: bad });
	openAiInputs.push({ ...okSegments, words: bad });
}
openAiInputs.push({ text: "a", words: [{ word: "a", start: 2, end: 1 }] });
openAiInputs.push({ text: "a", segments: [{ text: "a", start: 2, end: 1 }] });
openAiInputs.push({ text: "a", words: [{ word: "a", start: -1, end: Number.NaN }] });
openAiInputs.push({
	text: "a b",
	words: [
		{ word: "a", start: 0, end: 1 },
		{ word: "b", start: -1, end: -2 },
	],
});
openAiInputs.push({ text: "a", words: [{ word: "a", start: 1, end: 1 }] });
openAiInputs.push({ text: 5, words: [{ word: "a", start: -1, end: 1 }] });

const detectKeys = [
	"task",
	"language",
	"duration",
	"text",
	"words",
	"segments",
	"usage",
	"logprobs",
];
const VALUES = [
	undefined,
	"transcribe",
	"english",
	1.5,
	"",
	[],
	[{ word: "a", start: 0, end: 1 }],
	[{ text: "a", start: 0, end: 1 }],
	null,
	{},
	0,
];
const isInputs = [null, "x", [], 1, true, {}, [{ text: "a" }], ...openAiInputs.slice(0, 12)];
for (const key of detectKeys) {
	for (const v of VALUES) isInputs.push(withField({}, key, v));
}
for (let i = 0; i < 300; i++) {
	const o = {};
	for (const key of detectKeys) if (random() < 0.4) o[key] = pick(VALUES);
	isInputs.push(o);
}

// elevenLabsTranscriptToCaptions(): Speech-to-Text responses and JSON exports.
const W = (text, type, start, end, extra = {}) => ({ text, type, start, end, ...extra });
const stt = (list) => ({ language_code: "en", words: list });
const elevenInputs = [
	{ language_code: "en", words: [W("Hello", "word", 0, 0.5)] },
	{
		language_code: "eng",
		language_probability: 0.98,
		text: "Hi there",
		words: [
			W("Hi", "word", 0, 0.3, { speaker_id: "speaker_0", logprob: 0 }),
			W(" ", "spacing", 0.3, 0.35, { speaker_id: "speaker_0", logprob: 0 }),
			W("there", "word", 0.35, 0.9, {
				speaker_id: "speaker_0",
				logprob: -0.1,
				characters: [{ text: "t", start: 0.35, end: 0.4 }],
			}),
		],
	},
	stt([W("(laughs)", "audio_event", 0, 0.5), W(" ", "spacing", 0.5, 0.6), W("Hi", "word", 0.6, 1)]),
	stt([W("a", "word", 0, 1), W("b", "word", 1, 2)]),
	stt([
		W("a", "word", 0, 1),
		W("\n", "spacing", 1, 1.2),
		W("\t", "spacing", 1.3, 1.5),
		W("b", "word", 1.5, 2),
	]),
	stt([W("a", "word", 0, 1), W("(x)", "audio_event", 1, 1.5), W("b", "word", 1.5, 2)]),
	stt([
		W("a", "word", 0, 1),
		W(" ", "spacing", 1, 1.1),
		W("(x)", "audio_event", 1.1, 1.2),
		W(" ", "spacing", 1.3, 1.5),
		W("b", "word", 1.6, 2),
	]),
	stt([W("a", "word", 0, 1), W(" ", "spacing", 1, 1.5)]),
	stt([W(" a", "word", 0, 1), W("b ", "word", 1, 2)]),
	stt([W("a", "word", 0, 1), W(" ", "spacing", 1.8, 1.9), W("b", "word", 1.5, 2)]),
	stt([W(" ", "spacing", 0, 0.5), W("\n", "spacing", 0.5, 0.6), W("a", "word", 1, 2)]),
	stt([]),
	{ words: [W("Hi", "word", 0, 1)] },
	{ language_code: null, words: [W("Hi", "word", 0, 1)] },
	{ language_code: "en", segments: [{ text: "Hello world", start_time: 0, end_time: 1 }] },
	{
		language_code: "en",
		segments: [
			{
				text: "Hello world",
				start_time: 0,
				end_time: 1,
				words: [
					{ text: "Hello", start_time: 0, end_time: 0.5 },
					{ text: " world", start_time: 0.5, end_time: 1 },
				],
			},
		],
	},
	{ language_code: "en", segments: [{ text: "Hello", start_time: 0, end_time: 1, words: [] }] },
	{ segments: [{ text: "Hello", start_time: 0, end_time: 1 }] },
	{ language_code: null, segments: [{ text: "Hello", start_time: 0, end_time: 1 }] },
	{
		language_code: "en",
		segments: [
			{
				text: "Hi",
				start_time: 0,
				end_time: 1,
				speaker: { id: "a" },
				words: [{ text: "Hi", start_time: 0, end_time: 1, type: "word" }],
			},
		],
	},
	{
		language_code: "en",
		segments: [
			{
				text: "Hi",
				start_time: 0,
				end_time: 1,
				words: [
					{ text: "Hi", start_time: 0, end_time: 0.4, type: "word" },
					{ text: " ", start_time: 0.4, end_time: 0.5, type: "spacing" },
					{ text: "(x)", start_time: 0.5, end_time: 1, type: "audio_event" },
				],
			},
		],
	},
	{
		language_code: "en",
		words: [W("A", "word", 0, 1)],
		segments: [{ text: "B", start_time: 0, end_time: 1 }],
	},
	{ language_code: "en", segments: [] },
	{ language_code: "en", words: [], segments: [{ text: "B", start_time: 0, end_time: 1 }] },
	null,
	"x",
	[],
	{},
];
for (let i = 0; i < 200; i++) {
	const list = [];
	let t = random();
	for (let j = int(10); j >= 0; j--) {
		const type = pick(["word", "word", "word", "spacing", "spacing", "audio_event"]);
		const start = t;
		t += random();
		list.push(
			W(
				type === "spacing" ? pick([" ", "\n", "", "  "]) : pick(["a", " b", "c ", "(x)"]),
				type,
				start,
				t,
			),
		);
		if (random() < 0.2) t -= random() / 2;
	}
	elevenInputs.push(stt(list));
}
for (let i = 0; i < 100; i++) {
	const segments = Array.from({ length: 1 + int(3) }, () => {
		const start_time = Math.floor(random() * 10000) / 100;
		const end_time = start_time + random() * 2;
		const segment = { text: pick(["Hello world", "x", " "]), start_time, end_time };
		if (random() < 0.5) {
			segment.words = Array.from({ length: int(4) }, (_, k) => ({
				text: pick(["a", " b", " "]),
				start_time: start_time + k * 0.1,
				end_time: start_time + k * 0.1 + random() * 0.1,
				...(random() < 0.5 ? { type: pick(["word", "spacing", "audio_event", "other"]) } : {}),
			}));
		}
		return segment;
	});
	elevenInputs.push({ language_code: pick(["en", null]), segments });
}
const okStt = stt([W("a", "word", 0, 1), W(" ", "spacing", 1, 1.2), W("b", "word", 1.2, 2)]);
const okSeg = {
	language_code: "en",
	segments: [
		{ text: "a", start_time: 0, end_time: 1, words: [{ text: "a", start_time: 0, end_time: 1 }] },
	],
};
for (const raw of BAD) {
	const bad = decodeBad(raw);
	elevenInputs.push(withField(okStt, "language_code", bad));
	elevenInputs.push(withField(okStt, "words", bad));
	elevenInputs.push(withField(okSeg, "language_code", bad));
	elevenInputs.push(withField(okSeg, "segments", bad));
	for (const key of ["text", "type", "start", "end"]) {
		elevenInputs.push({
			...okStt,
			words: [okStt.words[0], withField(okStt.words[1], key, bad), okStt.words[2]],
		});
		elevenInputs.push({
			...okStt,
			words: [okStt.words[0], okStt.words[1], withField(okStt.words[2], key, bad)],
		});
	}
	for (const key of ["text", "start_time", "end_time", "words"]) {
		elevenInputs.push({ ...okSeg, segments: [withField(okSeg.segments[0], key, bad)] });
	}
	for (const key of ["text", "start_time", "end_time", "type"]) {
		elevenInputs.push({
			...okSeg,
			segments: [
				{ ...okSeg.segments[0], words: [withField(okSeg.segments[0].words[0], key, bad)] },
			],
		});
	}
}
elevenInputs.push(stt([W("a", "word", 2, 1)]));
elevenInputs.push(stt([W("a", "spacing", 2, 1)]));
elevenInputs.push(stt([W("a", "audio_event", -1, 1)]));
elevenInputs.push(stt([W("a", "word", -1, Number.NaN)]));
elevenInputs.push({ language_code: "en", segments: [{ text: "a", start_time: 2, end_time: 1 }] });
elevenInputs.push({
	language_code: "en",
	segments: [
		{ text: "a", start_time: 0, end_time: 1, words: [{ text: "a", start_time: 2, end_time: 1 }] },
	],
});
elevenInputs.push({
	language_code: "en",
	segments: [
		{ text: "a", start_time: -1, end_time: 1, words: [{ text: "a", start_time: -1, end_time: 1 }] },
	],
});

const detectInputs = [null, "x", [], 1, {}];
for (const lc of [undefined, "en", null, 5]) {
	for (const w of [undefined, [], "x", null]) {
		for (const s of [undefined, [], "x", null]) {
			const o = {};
			if (lc !== undefined) o.language_code = lc;
			if (w !== undefined) o.words = w;
			if (s !== undefined) o.segments = s;
			detectInputs.push(o);
		}
	}
}
detectInputs.push(...elevenInputs.slice(0, 30));

const write = (pkg, name, data) => {
	const dir = join(root, "packages", pkg, "src/__oracle__");
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, name), `${JSON.stringify({ version, ...data })}\n`);
};

write("install-whisper-cpp", "to-captions.json", {
	package: "@remotion/install-whisper-cpp",
	description:
		"toCaptions() over whisper.cpp outputs: two real transcriptions of whisper.cpp's samples/jfk.wav (tools/oracle/fixtures/jfk-transcription.json), hand-picked edge cases and seeded random ones. A failure records its message and class.",
	cases: toCaptionsInputs.map((input) => record(toCaptions, input)),
});
write("openai-whisper", "openai-whisper.json", {
	package: "@remotion/openai-whisper",
	description:
		"openAiWhisperApiToCaptions({ transcription }) over verbose_json shapes (documented samples, punctuation edge cases, seeded random texts and timings, invalid fields), and isOpenAiWhisperTranscript() over objects built from its keys. No API is called.",
	toCaptions: openAiInputs.map((transcription) =>
		record((t) => openAiWhisperApiToCaptions({ transcription: t }), transcription),
	),
	isTranscript: isInputs.map((input) => ({
		input: clone(input),
		output: isOpenAiWhisperTranscript(input),
	})),
});
write("elevenlabs", "elevenlabs.json", {
	package: "@remotion/elevenlabs",
	description:
		"elevenLabsTranscriptToCaptions({ transcript }) over Speech-to-Text responses and JSON exports (documented samples, spacing and audio events, seeded random ones, invalid fields), and detectElevenLabsTranscriptFormat() over key combinations. No API is called.",
	toCaptions: elevenInputs.map((transcript) =>
		record((t) => elevenLabsTranscriptToCaptions({ transcript: t }), transcript),
	),
	detect: detectInputs.map((input) => ({
		input: clone(input),
		output: detectElevenLabsTranscriptFormat(input),
	})),
});
console.log(
	`to-captions.json ${toCaptionsInputs.length}, openai-whisper.json ${openAiInputs.length}+${isInputs.length}, elevenlabs.json ${elevenInputs.length}+${detectInputs.length}`,
);
