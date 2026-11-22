import { createTikTokStyleCaptions, parseSrt, parseVtt, serializeSrt } from "@remotion/captions";
import { capture, makeRng, writeFixture } from "./lib.mjs";

const PACKAGE = "@remotion/captions";

// Inputs come from small grammars over hand-picked fragments (valid,
// malformed and borderline), combined at random with a fixed seed, plus the
// examples from the documentation.

const makePick = (rng) => (items) => items[Math.floor(rng() * items.length)];

const SRT_TIMESTAMPS = [
	"00:00:01,000",
	"00:00:02,500",
	"0:0:1,5",
	"00:00:01.000",
	"00:61:01,000",
	"00:00:01",
	"00:00:01,",
	"1:00:00,000",
	"00:00:01,1234",
	"0a:00:01,000",
	"00:00:01,abc",
	"::1,000",
	"",
	" 00:00:03,000",
	"00:00:01,000x",
	"-00:00:01,000",
	"01:02,500",
	"00:00:00,999",
	"100:00:00,000",
	"00:00:60,000",
	"00:00:01,00",
];
const SRT_TEXT = [
	"A",
	"Hello world",
	"  padded  ",
	"\tTab",
	" ",
	"",
	"x  ",
	"  y",
	"2",
	"<i>it</i> &amp;",
	"00:00:05,000 --> 00:00:06,000",
	"1",
	" ",
	"é ü 日本",
];
const SRT_INDEX = ["1", "2", "01", " 3 ", "-1", "1.5", "x", "10"];
const SRT_SETTINGS = [
	"",
	" align:start position:0%",
	" X1:100 X2:200 Y1:300 Y2:400",
	" foo",
	" X1:abc",
	" line:-1 size:50%",
	" region:x",
];

const generateSrt = (rng) => {
	const pick = makePick(rng);
	const timing = () =>
		pick([
			() => `${pick(SRT_TIMESTAMPS)} --> ${pick(SRT_TIMESTAMPS)}${pick(SRT_SETTINGS)}`,
			() => `${pick(SRT_TIMESTAMPS)}-->${pick(SRT_TIMESTAMPS)}`,
			() => `${pick(SRT_TIMESTAMPS)} -->  ${pick(SRT_TIMESTAMPS)}`,
			() => ` ${pick(SRT_TIMESTAMPS)} --> ${pick(SRT_TIMESTAMPS)} `,
			() => `${pick(SRT_TIMESTAMPS)}\t-->\t${pick(SRT_TIMESTAMPS)}`,
			() => `${pick(SRT_TIMESTAMPS)} --> ${pick(SRT_TIMESTAMPS)} --> ${pick(SRT_TIMESTAMPS)}`,
		])();
	// A share of files has only well-formed cues (ascending times, valid
	// settings), so strict parsing also succeeds and reaches its later checks.
	const allGood = rng() < 0.4;
	const goodSettings = SRT_SETTINGS.slice(0, 3).concat(SRT_SETTINGS.slice(5, 6));
	let clock = 0;
	const goodTimestamp = () => {
		clock += Math.floor(rng() * 4000);
		const h = Math.floor(clock / 3_600_000);
		const m = Math.floor(clock / 60_000) % 60;
		const sec = Math.floor(clock / 1000) % 60;
		const pad = (n, l = 2) => String(n).padStart(l, "0");
		return `${h > 0 && rng() < 0.5 ? h : pad(h)}:${pad(m)}:${pad(sec)}${pick([",", "."])}${pad(clock % 1000, 3)}`;
	};
	const parts = [];
	if (!allGood && rng() < 0.15) parts.push(pick(["", "junk", " "]));
	const cues = Math.floor(rng() * 5);
	for (let i = 0; i < cues; i++) {
		const good = allGood || rng() < 0.5;
		if (good || rng() < 0.9) parts.push(good ? String(i + 1) : pick(SRT_INDEX));
		if (good) {
			const start = goodTimestamp();
			parts.push(`${start} --> ${goodTimestamp()}${pick(allGood ? goodSettings : SRT_SETTINGS)}`);
		} else if (rng() < 0.95) parts.push(timing());
		const lines = good ? 1 + Math.floor(rng() * 3) : Math.floor(rng() * 4);
		for (let j = 0; j < lines; j++) parts.push(good ? pick(SRT_TEXT.slice(0, 4)) : pick(SRT_TEXT));
		const blanks = good ? 1 : Math.floor(rng() * 3);
		for (let j = 0; j < blanks; j++) parts.push(pick(["", " ", ""]));
	}
	let input = parts.join(pick(["\n", "\n", "\r\n", "\r"]));
	if (rng() < 0.3) input += pick(["\n", "\n\n", "  "]);
	if (rng() < 0.05) input = `﻿${input}`;
	return input;
};

const VTT_TIMESTAMPS = [
	"00:01.000",
	"00:00:02.500",
	"1:00:01.000",
	"00:01,500",
	"00:01.5",
	"00:61.000",
	"abc",
	"00:01",
	"",
	"01.000",
	"0:0:0:1.000",
	"00:01.000x",
	" 00:02.000",
	"-00:01.000",
];
const VTT_TEXT = [
	"A",
	"  padded  ",
	"\t",
	" ",
	"<v Bob>Hi</v>",
	"<i>it</i> &amp; &lt;b&gt;",
	"&#169;&#xA9;&#X41;&#0;&bogus;",
	"<00:00:01.000><c>w</c>",
	"x <1 < 2 >",
	"&nbsp;&lrm;&rlm;&quot;&apos;",
	"&#xD800;",
	"&#55357;&#56832;",
	"&#128512;&#x1F600;",
	"&AMP;",
	"&#;",
	"1",
	"NOTE in text",
	"WEBVTT",
	"00:09.000 --> 00:10.000",
	"<b>",
	"&amp;lt;",
	"é",
];

const generateVtt = (rng) => {
	const pick = makePick(rng);
	const timing = () =>
		pick([
			() => `${pick(VTT_TIMESTAMPS)} --> ${pick(VTT_TIMESTAMPS)}`,
			() => `${pick(VTT_TIMESTAMPS)} --> ${pick(VTT_TIMESTAMPS)} align:start position:10%`,
			() => `${pick(VTT_TIMESTAMPS)}-->${pick(VTT_TIMESTAMPS)}`,
			() => `${pick(VTT_TIMESTAMPS)}\t-->\t${pick(VTT_TIMESTAMPS)}`,
		])();
	const goodTiming = () =>
		`${pick(["00:01.000", "00:00:02.500", "1:00:01.000"])} --> ${pick(["00:03.000", "00:00:04,500"])}${pick(["", " align:start"])}`;
	const parts = [];
	if (rng() < 0.7) parts.push(pick(["WEBVTT", "WEBVTT - title", "WEBVTTX", "webvtt", " WEBVTT"]));
	if (rng() < 0.8) parts.push("");
	const blocks = Math.floor(rng() * 5);
	for (let i = 0; i < blocks; i++) {
		const r = rng();
		if (r < 0.15) {
			parts.push(
				pick(["NOTE comment", "NOTE", "STYLE", "REGION", "NOTEBOOK", "NOTE\tx", "STYLE x"]),
			);
			parts.push(pick(["more", "::cue {}", "00:01.000 --> 00:02.000"]));
		} else {
			const good = r < 0.6;
			if (rng() < 0.3) parts.push(pick(["id1", "cue-2", "3"]));
			if (!good && rng() < 0.1) parts.push(pick(["extra", "id"]));
			if (good) parts.push(goodTiming());
			else if (rng() < 0.95) parts.push(timing());
			const lines = Math.floor(rng() * 4);
			for (let j = 0; j < lines; j++) parts.push(pick(VTT_TEXT));
		}
		const blanks = Math.floor(rng() * 3) + (rng() < 0.8 ? 1 : 0);
		for (let j = 0; j < blanks; j++) parts.push(pick(["", "", " "]));
	}
	let input = parts.join(pick(["\n", "\n", "\r\n", "\r"]));
	if (rng() < 0.05) input = `﻿${input}`;
	return input;
};

const WORDS = [
	" a",
	"b",
	" hello",
	"  two",
	"\nnl",
	" c\n",
	"x ",
	"  ",
	" ",
	"",
	"\n",
	" end.\n\n",
	"\t tab",
	" é",
];

const generateCaptions = (rng) => {
	const pick = makePick(rng);
	const count = Math.floor(rng() * 9);
	let t = Math.floor(rng() * 500);
	const captions = [];
	for (let i = 0; i < count; i++) {
		const startMs = t + pick([0, 0, 10, 100, 300, 1000, -50]) + (rng() < 0.05 ? 0.5 : 0);
		const endMs = startMs + pick([0, 50, 200, 600, 1500]);
		const caption = { text: pick(WORDS), startMs, endMs, timestampMs: null, confidence: null };
		const r = rng();
		if (r < 0.15) caption.pageBreakAfter = true;
		else if (r < 0.2) caption.pageBreakAfter = false;
		captions.push(caption);
		t = endMs;
	}
	return captions;
};

const DOC_SRT = `1
00:00:00,000 --> 00:00:02,500
Welcome to the Example Subtitle File!

2
00:00:03,000 --> 00:00:06,000
This is a demonstration of SRT subtitles.

3
00:00:07,000 --> 00:00:10,500
You can use SRT files to add subtitles to your videos.`;

const DOC_VTT = `WEBVTT

00:00:00.000 --> 00:00:02.500
Welcome to the Example WebVTT File!

00:00:03.000 --> 00:00:06.000
This is a demonstration of WebVTT subtitles.`;

const DOC_TIKTOK = [
	{ text: "Using", startMs: 40, endMs: 300, timestampMs: 200, confidence: null },
	{ text: " Remotion's", startMs: 300, endMs: 900, timestampMs: 440, confidence: null },
	{ text: " TikTok", startMs: 900, endMs: 1260, timestampMs: 1080, confidence: null },
	{ text: " template,", startMs: 1260, endMs: 1950, timestampMs: 1600, confidence: null },
];

const CASES = 1500;

export const recordCaptions = () => {
	const srtRng = makeRng(101);
	const srtInputs = [DOC_SRT, "", "   ", "garbage", "1\n00:00:01 --> 00:00:02\nno ms"];
	for (let i = 0; i < CASES; i++) srtInputs.push(generateSrt(srtRng));
	writeFixture(
		"captions",
		PACKAGE,
		"parse-srt",
		"parseSrt({input}) and parseSrt({input, strict: true}) on generated SubRip files",
		srtInputs.map((input) => ({
			input,
			tolerant: capture(() => parseSrt({ input }).captions),
			strict: capture(() => parseSrt({ input, strict: true }).captions),
		})),
	);

	const vttRng = makeRng(202);
	const vttInputs = [DOC_VTT, "", "garbage"];
	for (let i = 0; i < CASES; i++) vttInputs.push(generateVtt(vttRng));
	writeFixture(
		"captions",
		PACKAGE,
		"parse-vtt",
		"parseVtt({input}) on generated WebVTT files",
		vttInputs.map((input) => ({ input, result: capture(() => parseVtt({ input }).captions) })),
	);

	const ttRng = makeRng(303);
	const pick = makePick(ttRng);
	const tiktok = [{ captions: DOC_TIKTOK, combineTokensWithinMilliseconds: 1200 }];
	for (let i = 0; i < CASES; i++) {
		const options = {
			captions: generateCaptions(ttRng),
			combineTokensWithinMilliseconds: pick([0, 100, 500, 1200, 5000]),
		};
		const r = ttRng();
		if (r < 0.4) options.breakOnSilenceAfterMilliseconds = pick([0, 50, 300, 1000]);
		else if (r < 0.45) options.breakOnSilenceAfterMilliseconds = null;
		tiktok.push(options);
	}
	writeFixture(
		"captions",
		PACKAGE,
		"create-tiktok-style-captions",
		"createTikTokStyleCaptions(options) on generated word captions; a missing breakOnSilenceAfterMilliseconds key means the option was omitted",
		tiktok.map((options) => ({
			options,
			result: capture(() => createTikTokStyleCaptions(options)),
		})),
	);

	const srtOutRng = makeRng(404);
	const serialize = [{ lines: DOC_TIKTOK.map((c) => [c]) }, { lines: [] }];
	for (let i = 0; i < CASES; i++) {
		const captions = generateCaptions(srtOutRng);
		for (const caption of captions) {
			if (srtOutRng() < 0.05) {
				caption.startMs = makePick(srtOutRng)([-1, -1500, 360061001.4, 999.5, Number.NaN]);
			}
		}
		const lines = [];
		let k = 0;
		while (k < captions.length) {
			const n = Math.floor(srtOutRng() * 4);
			lines.push(captions.slice(k, k + n));
			k += n;
		}
		if (srtOutRng() < 0.1) lines.push([]);
		serialize.push({ lines });
	}
	writeFixture(
		"captions",
		PACKAGE,
		"serialize-srt",
		"serializeSrt({lines}) on generated cues, including negative, fractional and NaN times",
		serialize.map((input) => ({ input, result: capture(() => serializeSrt(input)) })),
	);
};
