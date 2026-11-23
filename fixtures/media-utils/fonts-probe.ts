// Page-side probe for loadFont(), shared by the oracle recorder and Motio's fonts browser test.
// Lives here because it uses the same fixture server; the font files come from
// fixtures/compositions/public (served under /f/).

type LoadFont = (options: Record<string, unknown>) => Promise<unknown>;

/** loadFont() calls, in order. */
export const FONT_CASES: Record<string, unknown>[] = [
	{ family: "Basic", url: "/f/inter-400.woff2" },
	{
		family: "All Descriptors",
		url: "/f/inter-700.woff2?v=1#hash",
		weight: "700",
		style: "italic",
		display: "swap",
		stretch: "condensed",
		unicodeRange: "U+0000-00FF",
		featureSettings: '"liga" 0',
		ascentOverride: "90%",
		descentOverride: "20%",
		lineGapOverride: "0%",
	},
	{ family: "Numeric Weight", url: "/f/inter-400.woff2", weight: 500 },
	{ family: "Explicit Format", url: "/f/inter-400.woff2", format: "woff2" },
	{ family: "Wrong Format", url: "/f/inter-400.woff2", format: "truetype" },
	{ family: "Missing", url: "/f/missing.woff2" },
	{ family: "Missing Ttf", url: "/f/missing.ttf" },
	{ family: "No Extension", url: "/f/inter400" },
	{ family: "Unknown Extension", url: "/f/inter.eot" },
	{ family: "Upper Case", url: "/f/INTER.WOFF2" },
];

/** Runs every case and returns the outcome plus the resulting FontFace descriptors. */
export async function runFontsProbe(loadFont: LoadFont) {
	const results: unknown[] = [];
	for (const options of FONT_CASES) {
		let outcome: Record<string, unknown>;
		try {
			const value = await loadFont(options);
			outcome = { resolved: value === undefined ? "undefined" : typeof value };
		} catch (e) {
			// The class is recorded so the tests compare failures on behaviour, not on wording.
			outcome =
				e instanceof Error
					? { error: e.message, name: e.name }
					: { error: String(e), name: typeof e };
		}
		const faces = [...document.fonts]
			.filter((f) => f.family.replace(/^"|"$/g, "") === options.family)
			.map((f) => ({
				family: f.family,
				style: f.style,
				weight: f.weight,
				stretch: f.stretch,
				unicodeRange: f.unicodeRange,
				featureSettings: f.featureSettings,
				display: f.display,
				ascentOverride: f.ascentOverride,
				descentOverride: f.descentOverride,
				lineGapOverride: f.lineGapOverride,
				status: f.status,
			}));
		results.push({ options, ...outcome, faces });
	}
	return results;
}
