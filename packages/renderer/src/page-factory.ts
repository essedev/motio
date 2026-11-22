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
			await page.setComposition(composition.id, composition.props);
		} catch (err) {
			await page.close();
			throw err;
		}
		return page;
	};
}
