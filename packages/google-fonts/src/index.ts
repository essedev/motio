import { FONT_LIST } from "./font-list.js";

export type { FontInfo, LoadFontOptions, LoadFontResult } from "./create-font-module.js";

/** A Google Font that can be imported from `@motiojs/google-fonts/<importName>`. */
export interface AvailableFont {
	fontFamily: string;
	importName: string;
	/** Imports the font's module lazily. */
	load: () => Promise<unknown>;
}

/** Every Google Font available, with a lazy loader for each module. */
export function getAvailableFonts(): AvailableFont[] {
	return FONT_LIST.map((f) => ({
		fontFamily: f.fontFamily,
		importName: f.importName,
		load: f.load,
	}));
}
