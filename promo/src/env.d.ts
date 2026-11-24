// Vite turns these imports into a URL (font files) or the file's text (`?raw`).
declare module "*.woff2" {
	const url: string;
	export default url;
}
declare module "*?raw" {
	const text: string;
	export default text;
}
