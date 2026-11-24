import {
	type Caption,
	createTikTokStyleCaptions,
	parseSrt,
	parseVtt,
	serializeSrt,
	type TikTokPage,
} from "@motiojs/captions";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "@motiojs/motio";

// region: parse
const srt = `1
00:00:00,000 --> 00:00:02,500
Hello and welcome.

2
00:00:02,800 --> 00:00:05,000
Today we make a video with React.
`;

// One caption per cue: { text, startMs, endMs, timestampMs (the midpoint), confidence: 1 }.
const { captions: fromSrt } = parseSrt({ input: srt });
const { captions: fromVtt } = parseVtt({ input: "WEBVTT\n\n00:00.000 --> 00:02.500\nHello" });
// strict: true throws on a malformed file, naming the cue and the line, instead of skipping it.
const { captions: checked } = parseSrt({ input: srt, strict: true });
// endregion

// region: pages
// Word-level captions, as a speech-to-text tool returns them. Each word after the first carries
// its leading space: pages only break before a word that starts with one.
const words: Caption[] = [
	{ text: "Every", startMs: 0, endMs: 300, timestampMs: 150, confidence: 0.98 },
	{ text: " word", startMs: 300, endMs: 600, timestampMs: 450, confidence: 0.97 },
	{ text: " lands", startMs: 600, endMs: 1000, timestampMs: 800, confidence: 0.99 },
	{ text: " on", startMs: 1800, endMs: 1950, timestampMs: 1875, confidence: 0.95 },
	{ text: " time.", startMs: 1950, endMs: 2400, timestampMs: 2175, confidence: 0.96 },
];

// A new page starts once the current one lasts more than 1200 ms, or after 500 ms of silence.
const { pages } = createTikTokStyleCaptions({
	captions: words,
	combineTokensWithinMilliseconds: 1200,
	breakOnSilenceAfterMilliseconds: 500,
});
// pages[0]: { text: "Every word lands", startMs: 0, durationMs: 1800, tokens: [...] }
// pages[1]: { text: "on time.", startMs: 1800, durationMs: 600, tokens: [...] }
// endregion

// region: render
const Page = ({ page }: { page: TikTokPage }) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	// Inside the <Sequence>, frame 0 is the start of the page.
	const nowMs = page.startMs + (frame / fps) * 1000;
	return (
		// Captions keep their spaces in `text`: pre-wrap shows them and still wraps long pages.
		<div style={{ fontSize: 80, fontWeight: 800, whiteSpace: "pre-wrap", textAlign: "center" }}>
			{page.tokens.map((token) => (
				<span
					key={token.fromMs}
					style={{ color: token.fromMs <= nowMs && nowMs < token.toMs ? "#ffb000" : "white" }}
				>
					{token.text}
				</span>
			))}
		</div>
	);
};

export const CaptionTrack = () => {
	const { fps } = useVideoConfig();
	return (
		<AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: 120 }}>
			{pages.map((page) => (
				<Sequence
					key={page.startMs}
					from={Math.round((page.startMs / 1000) * fps)}
					durationInFrames={Math.max(1, Math.round((page.durationMs / 1000) * fps))}
					layout="none"
				>
					<Page page={page} />
				</Sequence>
			))}
		</AbsoluteFill>
	);
};
// endregion

// region: serialize
// One cue per item of `lines`: here one cue per page of words.
const srtFile = serializeSrt({
	lines: pages.map((page) =>
		words.filter(
			(word) => word.startMs >= page.startMs && word.endMs <= page.startMs + page.durationMs,
		),
	),
});
// endregion

export const all = [fromSrt, fromVtt, checked, srtFile];
