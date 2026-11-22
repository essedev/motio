import { RenderPage } from "./render-page.js";
import type { BrowserSession, VideoConfig } from "./session.js";

/** Returns a function opening pages with `composition` selected at the given size. */
export function compositionPageFactory(
	session: BrowserSession,
	composition: VideoConfig,
	size: { width: number; height: number; scale: number; transparent: boolean },
): () => Promise<RenderPage> {
	return async () => {
		const page = await RenderPage.open(session.pageConfig(size));
		try {
			// The composition is already resolved (selectComposition ran calculateMetadata):
			// render it as given instead of resolving its final props a second time.
			await page.setComposition(composition.id, composition.props, {
				resolved: {
					width: composition.width,
					height: composition.height,
					fps: composition.fps,
					durationInFrames: composition.durationInFrames,
					props: composition.props,
					defaultCodec: composition.defaultCodec,
					defaultOutName: composition.defaultOutName,
					defaultPixelFormat: composition.defaultPixelFormat,
					defaultVideoImageFormat: composition.defaultVideoImageFormat,
					defaultProResProfile: composition.defaultProResProfile,
					defaultSampleRate: composition.defaultSampleRate,
				},
			});
		} catch (err) {
			await page.close();
			throw err;
		}
		return page;
	};
}
