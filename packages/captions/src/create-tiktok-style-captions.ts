import type { Caption } from "./caption.js";

/** One word of a `TikTokPage`, with absolute timing. */
export type TikTokToken = {
	text: string;
	fromMs: number;
	toMs: number;
	/** Present when the source caption forced the page to end after this token. */
	pageBreakAfter?: boolean;
};

/** A page of captions shown together, as returned by `createTikTokStyleCaptions()`. */
export type TikTokPage = {
	text: string;
	startMs: number;
	tokens: TikTokToken[];
	/** Until the next page starts, or until the last token ends for the last page. */
	durationMs: number;
};

/** Options of `createTikTokStyleCaptions()`. */
export type CreateTikTokStyleCaptionsInput = {
	captions: Caption[];
	/** Once a page lasts longer than this, the next caption that starts with a space begins a new page. */
	combineTokensWithinMilliseconds: number;
	/** A silence at least this long between two captions begins a new page early. */
	breakOnSilenceAfterMilliseconds?: number | null;
};

/** Return value of `createTikTokStyleCaptions()`. */
export type CreateTikTokStyleCaptionsOutput = {
	pages: TikTokPage[];
};

type DraftPage = {
	text: string;
	startMs: number;
	/** End of the last caption on the page. */
	endMs: number;
	tokens: TikTokToken[];
};

/**
 * Groups word-level captions into pages for TikTok-style display, compatible
 * with Remotion's `createTikTokStyleCaptions()`. Words must carry their
 * leading space: a page only breaks before a word that starts with one, once
 * the page lasts longer than `combineTokensWithinMilliseconds` or after a
 * silence of at least `breakOnSilenceAfterMilliseconds`. A caption with
 * `pageBreakAfter: true` always ends its page. Whitespace-only captions add
 * their text to the current page but never become tokens or start a page.
 *
 * @example createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds: 1200 })
 */
export const createTikTokStyleCaptions = ({
	captions,
	combineTokensWithinMilliseconds,
	breakOnSilenceAfterMilliseconds,
}: CreateTikTokStyleCaptionsInput): CreateTikTokStyleCaptionsOutput => {
	const drafts: DraftPage[] = [];
	let page: DraftPage | null = null;
	let forceBreak = false;
	let lastEndMs = 0;
	for (const caption of captions) {
		lastEndMs = caption.endMs;
		if (page !== null) {
			const startsWord = caption.text.startsWith(" ");
			const tooLong = page.endMs - page.startMs > combineTokensWithinMilliseconds;
			// As in Remotion, only undefined disables the silence rule: null
			// compares as 0 and breaks at every word.
			const silent =
				breakOnSilenceAfterMilliseconds !== undefined &&
				caption.startMs - page.endMs >= (breakOnSilenceAfterMilliseconds ?? 0);
			if (forceBreak || (startsWord && (tooLong || silent))) {
				drafts.push(page);
				page = null;
			}
		}
		forceBreak = caption.pageBreakAfter === true;
		if (caption.text.trim() === "") {
			// Whitespace-only captions never start a page or become tokens.
			if (page !== null) {
				page.text += caption.text;
				page.endMs = caption.endMs;
			}
			continue;
		}
		const text: string = page === null ? caption.text.trimStart() : caption.text;
		const token: TikTokToken = { text, fromMs: caption.startMs, toMs: caption.endMs };
		if (caption.pageBreakAfter === true) token.pageBreakAfter = true;
		if (page === null) {
			page = { text, startMs: caption.startMs, endMs: caption.endMs, tokens: [token] };
		} else {
			page.text += text;
			page.endMs = caption.endMs;
			page.tokens.push(token);
		}
	}
	if (page !== null) drafts.push(page);
	return {
		pages: drafts.map((draft, i) => {
			const next = drafts[i + 1];
			return {
				text: draft.text.replace(/\n$/, ""),
				startMs: draft.startMs,
				tokens: draft.tokens,
				durationMs: (next === undefined ? lastEndMs : next.startMs) - draft.startMs,
			};
		}),
	};
};
