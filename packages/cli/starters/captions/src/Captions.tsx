import { type Caption, createTikTokStyleCaptions, type TikTokPage } from "@motiojs/captions";
import { AbsoluteFill, Sequence, spring, useCurrentFrame, useVideoConfig } from "@motiojs/motio";

export interface CaptionsProps {
	/** File in public/ with the words, read by calculateMetadata() in Root.tsx. */
	src: string;
	/** Filled in by calculateMetadata(). */
	captions: Caption[];
}

/** Words closer together than this end up on the same page. */
const COMBINE_WITHIN_MS = 1200;

const Page = ({ page }: { page: TikTokPage }) => {
	// Inside a <Sequence>, frame 0 is the start of the page.
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const nowMs = page.startMs + (frame / fps) * 1000;
	const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 8 });

	return (
		<AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 80 }}>
			<div
				style={{
					fontFamily: "sans-serif",
					fontSize: 88,
					fontWeight: 800,
					textAlign: "center",
					whiteSpace: "pre-wrap",
					transform: `scale(${0.9 + 0.1 * enter})`,
					// Keeps the text on its own layer on every frame, so a frame renders the same
					// whichever frame came before it (motio check determinism).
					willChange: "transform",
				}}
			>
				{page.tokens.map((token) => {
					const active = token.fromMs <= nowMs && nowMs < token.toMs;
					return (
						<span key={token.fromMs} style={{ color: active ? "#ffb000" : "white" }}>
							{token.text}
						</span>
					);
				})}
			</div>
		</AbsoluteFill>
	);
};

export const Captions = ({ captions }: CaptionsProps) => {
	const { fps } = useVideoConfig();
	const { pages } = createTikTokStyleCaptions({
		captions,
		combineTokensWithinMilliseconds: COMBINE_WITHIN_MS,
	});

	return (
		<AbsoluteFill style={{ backgroundColor: "#101820" }}>
			{pages.map((page) => {
				const from = Math.round((page.startMs / 1000) * fps);
				const durationInFrames = Math.max(1, Math.round((page.durationMs / 1000) * fps));
				return (
					<Sequence key={page.startMs} from={from} durationInFrames={durationInFrames}>
						<Page page={page} />
					</Sequence>
				);
			})}
		</AbsoluteFill>
	);
};
