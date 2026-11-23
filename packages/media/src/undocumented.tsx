// Exports of `@remotion/media` that have no docs page. Motio provides stubs so imports build:
// `getTargetSampleRate()` returns what the published package returns in Node and in the pinned
// browser (recorded in __oracle__/exports.json), and `AudioForPreview` fails with a message.
// The compatibility manifest marks both "stubbed", so the compat plugin warns at build time.

/**
 * Stub of an undocumented `@remotion/media` export: returns 48000, the value the published
 * package returns in Node and in Chrome (and Remotion's documented default sample rate).
 */
export function getTargetSampleRate(): number {
	return 48_000;
}

/**
 * Stub of an undocumented `@remotion/media` component: rendering it throws. Use `<Audio>`, the
 * documented component of `@remotion/media`.
 */
export function AudioForPreview(_props: Record<string, unknown>): never {
	throw new Error(
		"AudioForPreview from @remotion/media is not documented by Remotion, so Motio does not implement it. Use <Audio> from @remotion/media instead.",
	);
}
