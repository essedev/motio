import { continueRender, delayRender, staticFile } from "remotion";

// Load the bundled Inter weights before any frame renders, so text never falls back to a
// system font (system fonts differ between machines).
const handle = delayRender("Loading Inter");
Promise.all(
	[
		["400", "inter-400.woff2"],
		["700", "inter-700.woff2"],
	].map(async ([weight, file]) => {
		const face = new FontFace("Inter", `url(${staticFile(file as string)})`, {
			weight: weight as string,
		});
		await face.load();
		document.fonts.add(face);
	}),
).then(() => continueRender(handle));

export const fontFamily = "Inter";
