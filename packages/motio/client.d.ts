// Types for the files a Motio project imports through its bundler (Vite): assets become URLs,
// `?raw` gives a file's text, CSS modules give their class names. Reference them with
// `"types": ["@motiojs/motio/client"]` in tsconfig.json, or
// `/// <reference types="@motiojs/motio/client" />`.

// Images.
declare module "*.apng" {
	const url: string;
	export default url;
}
declare module "*.avif" {
	const url: string;
	export default url;
}
declare module "*.bmp" {
	const url: string;
	export default url;
}
declare module "*.gif" {
	const url: string;
	export default url;
}
declare module "*.ico" {
	const url: string;
	export default url;
}
declare module "*.jpeg" {
	const url: string;
	export default url;
}
declare module "*.jpg" {
	const url: string;
	export default url;
}
declare module "*.png" {
	const url: string;
	export default url;
}
declare module "*.svg" {
	const url: string;
	export default url;
}
declare module "*.webp" {
	const url: string;
	export default url;
}

// Video and audio. Large media belongs in public/ with staticFile(), so it is not copied into
// the bundle on every build.
declare module "*.aac" {
	const url: string;
	export default url;
}
declare module "*.flac" {
	const url: string;
	export default url;
}
declare module "*.m4a" {
	const url: string;
	export default url;
}
declare module "*.mov" {
	const url: string;
	export default url;
}
declare module "*.mp3" {
	const url: string;
	export default url;
}
declare module "*.mp4" {
	const url: string;
	export default url;
}
declare module "*.ogg" {
	const url: string;
	export default url;
}
declare module "*.opus" {
	const url: string;
	export default url;
}
declare module "*.wav" {
	const url: string;
	export default url;
}
declare module "*.webm" {
	const url: string;
	export default url;
}

// Fonts.
declare module "*.otf" {
	const url: string;
	export default url;
}
declare module "*.ttf" {
	const url: string;
	export default url;
}
declare module "*.woff" {
	const url: string;
	export default url;
}
declare module "*.woff2" {
	const url: string;
	export default url;
}

// Other files served as they are.
declare module "*.pdf" {
	const url: string;
	export default url;
}
declare module "*.txt" {
	const url: string;
	export default url;
}

// Any file with a query: its URL, its text, or its URL forced to a data URL or to a file.
declare module "*?url" {
	const url: string;
	export default url;
}
declare module "*?raw" {
	const text: string;
	export default text;
}
declare module "*?inline" {
	const url: string;
	export default url;
}
declare module "*?no-inline" {
	const url: string;
	export default url;
}

// CSS modules: the class names, mapped to the names in the bundle.
declare module "*.module.css" {
	const classes: { readonly [name: string]: string };
	export default classes;
}
declare module "*.module.scss" {
	const classes: { readonly [name: string]: string };
	export default classes;
}
