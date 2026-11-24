# @motiojs/captions

Captions for [Motio](../../README.md) videos: read SubRip and WebVTT files, group word timings into pages that appear one after the other, and write SubRip files. Plain functions with no dependencies, usable in a composition, in Node or in any browser code.

```bash
pnpm add @motiojs/captions
```

## The Caption type

Every function works on `Caption` objects:

| Field | |
|---|---|
| `text` | The words, with their whitespace: each word after the first starts with its space (`" world"`). Render it with `white-space: pre` or `pre-wrap` so the spaces show. |
| `startMs`, `endMs` | When it is spoken, in milliseconds. |
| `timestampMs` | One representative instant, or null. |
| `confidence` | From 0 to 1 when a transcription tool provides it, or null. |
| `pageBreakAfter` | Optional: forces a new page (or a new SubRip cue) after this caption. |

Speech-to-text tools give one caption per word; subtitle files give one per cue.

## Reading subtitle files

<!-- example: ../../docs/guide/examples/src/packages/captions.tsx#parse -->
```tsx
import { parseSrt, parseVtt } from "@motiojs/captions";

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
```

`parseSrt()` reads `.srt` files and `parseVtt()` reads `.vtt` files (header, cue identifiers and settings, `NOTE`, `STYLE` and `REGION` blocks ignored; markup tags removed, character references decoded). Both accept CRLF or LF line endings and a byte order mark. In a composition, load the file with `fetch(staticFile("subtitles.srt"))` inside `calculateMetadata()`, as the `captions` starter of `motio init` does with its JSON transcript.

## Pages of words

`createTikTokStyleCaptions()` groups word-level captions into pages, the short groups of words that short-form videos show one at a time, highlighting the word being spoken:

<!-- example: ../../docs/guide/examples/src/packages/captions.tsx#pages -->
```tsx
import { type Caption, createTikTokStyleCaptions } from "@motiojs/captions";

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
```

- A page grows while it lasts less than `combineTokensWithinMilliseconds`; the next word that starts with a space then begins a new page. A low value gives one word per page, a high value whole sentences.
- `breakOnSilenceAfterMilliseconds` (optional) starts a new page after a pause at least that long, so a page never spans a silence.
- Each page has its `text`, its `startMs`, its `durationMs` (until the next page starts; the last page ends with its last word) and `tokens`: the words with their own `fromMs` and `toMs`.

Showing each page in its own `<Sequence>` makes the timing simple:

<!-- example: ../../docs/guide/examples/src/packages/captions.tsx#render -->
```tsx
import type { TikTokPage } from "@motiojs/captions";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "@motiojs/motio";

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
```

## Writing SubRip files

<!-- example: ../../docs/guide/examples/src/packages/captions.tsx#serialize -->
```tsx
import { serializeSrt } from "@motiojs/captions";

// One cue per item of `lines`: here one cue per page of words.
const srtFile = serializeSrt({
	lines: pages.map((page) =>
		words.filter(
			(word) => word.startMs >= page.startMs && word.endMs <= page.startMs + page.durationMs,
		),
	),
});
```

`serializeSrt({ lines })` writes one cue per array of captions: its text is the captions' texts joined, and it lasts from the first one's `startMs` to the last one's `endMs`. A caption with `pageBreakAfter` ends its cue early; empty arrays are skipped. Use it to publish the subtitles of a rendered video next to it.

## Compatibility

The compat alias maps `@remotion/captions` here; the functions take and return the same shapes, checked against recordings of the published package.
