// `useVideoTexture()` and `useOffthreadVideoTexture()` are deprecated by Remotion and their
// reference pages are gone from remotion.dev (404), so their signatures cannot be taken from the
// docs. Motio provides stubs that fail with the replacement the docs give; the compatibility
// manifest marks them "stubbed", so the compat plugin warns at build time (docs/DECISIONS.md).

const replacement = (name: string) =>
	`${name}() from @remotion/three is deprecated and not implemented by Motio. Use a <Video> from @remotion/media with "headless" and "onVideoFrame" to update a THREE.CanvasTexture, as https://www.remotion.dev/docs/videos/as-threejs-texture shows.`;

/** Deprecated by Remotion: throws, pointing to the `@remotion/media` texture recipe. */
export function useVideoTexture(..._args: unknown[]): never {
	throw new Error(replacement("useVideoTexture"));
}

/** Deprecated by Remotion: throws, pointing to the `@remotion/media` texture recipe. */
export function useOffthreadVideoTexture(..._args: unknown[]): never {
	throw new Error(replacement("useOffthreadVideoTexture"));
}
