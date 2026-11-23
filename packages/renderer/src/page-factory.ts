import { MotioError } from "./errors.js";
import { RenderPage } from "./render-page.js";
import type { BrowserSession, VideoConfig } from "./session.js";

/**
 * Returns a function opening pages with `composition` selected at the given size. BeginFrame
 * capture is refused above concurrency 1: with several BeginFrame browsers drawing at once,
 * Chrome's display compositor can draw a page before that page's renderer delivered its frame, so
 * whole frames came out as an earlier frame or as the hidden document of the raster reset (4 of
 * 180 frames at concurrency 8 in the pinned image, none at concurrency 1 under load).
 */
export function compositionPageFactory(
	session: BrowserSession,
	composition: VideoConfig,
	size: { width: number; height: number; scale: number; transparent: boolean; concurrency: number },
): () => Promise<RenderPage> {
	if (session.captureMethod === "begin-frame" && size.concurrency > 1) {
		throw new MotioError(
			"E_BEGIN_FRAME_UNSUPPORTED",
			`BeginFrame capture renders one page at a time, but concurrency is ${size.concurrency}: with several pages Chrome can capture a page before it drew the frame. Pass concurrency 1, or use captureMethod "screenshot" (the default), which is as fast on one page and faster on several.`,
			{ composition: composition.id, details: { concurrency: size.concurrency } },
		);
	}
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
