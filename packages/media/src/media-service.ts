import { getRunContext } from "@motiojs/core/internals";
import type { FrameLocation, MediaInfo, MediaServiceError } from "@motiojs/core/protocol";
import { MEDIA_ROUTES } from "@motiojs/core/protocol";

/** How a time maps to a source frame (see `@motiojs/video-frames`). */
export type FrameSelection = "floor" | "nearest";

/** Resolves `src` against the document, as the browser would for a media element. */
export function absoluteSrc(src: string): string {
	if (typeof document === "undefined") return src;
	try {
		return new URL(src, document.baseURI).href;
	} catch {
		return src;
	}
}

function base(): string {
	const url = getRunContext()?.mediaBaseUrl;
	if (!url) {
		throw new Error(
			"The renderer did not provide a media service (mediaBaseUrl is missing from the run context). Render with a @motiojs/renderer that speaks the same frame protocol as this bundle.",
		);
	}
	return url.endsWith("/") ? url : `${url}/`;
}

function route(name: string, params: Record<string, string>): string {
	const query = new URLSearchParams(params).toString();
	return `${base()}${name}?${query}`;
}

/** URL of the image of the source frame shown at `t` seconds. */
export function frameUrl(
	src: string,
	t: number,
	mode: FrameSelection,
	transparent: boolean,
): string {
	return route(MEDIA_ROUTES.frame, {
		src: absoluteSrc(src),
		t: String(t),
		mode,
		alpha: transparent ? "1" : "0",
	});
}

/** Builds an `Error` from a failed media service response. */
export async function serviceError(res: Response, what: string): Promise<Error> {
	let message = `${res.status} ${res.statusText}`;
	try {
		const body = (await res.json()) as Partial<MediaServiceError>;
		if (typeof body.message === "string") message = body.message;
	} catch {
		// Not a JSON error body (for example a proxy error page): keep the HTTP status.
	}
	return new Error(`${what}: ${message}`);
}

async function getJson<T>(url: string, what: string): Promise<T> {
	const res = await fetch(url);
	if (!res.ok) throw await serviceError(res, what);
	return (await res.json()) as T;
}

const infos = new Map<string, Promise<MediaInfo>>();

/** Duration and streams of `src`, asked once per source. */
export function mediaInfo(src: string): Promise<MediaInfo> {
	const abs = absoluteSrc(src);
	let p = infos.get(abs);
	if (!p) {
		p = getJson<MediaInfo>(route(MEDIA_ROUTES.info, { src: abs }), `Could not read ${abs}`);
		p.catch(() => infos.delete(abs));
		infos.set(abs, p);
	}
	return p;
}

const locations = new Map<string, Promise<FrameLocation>>();

/** Where the source frame shown at `t` seconds is, for seeking a native element to it. */
export function locateFrame(src: string, t: number, mode: FrameSelection): Promise<FrameLocation> {
	const abs = absoluteSrc(src);
	const key = `${abs}#${mode}#${t}`;
	let p = locations.get(key);
	if (!p) {
		p = getJson<FrameLocation>(
			route(MEDIA_ROUTES.locate, { src: abs, t: String(t), mode }),
			`Could not locate the frame of ${abs} at ${t}s`,
		);
		p.catch(() => locations.delete(key));
		if (locations.size > 4096) locations.clear();
		locations.set(key, p);
	}
	return p;
}
