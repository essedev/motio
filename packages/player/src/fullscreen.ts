/** Fullscreen API access, including the WebKit-prefixed variant of older Safari. */

type FullscreenDocument = Document & {
	webkitFullscreenEnabled?: boolean;
	webkitFullscreenElement?: Element | null;
	webkitExitFullscreen?: () => void;
};

type FullscreenElement = HTMLElement & {
	webkitRequestFullscreen?: () => void;
};

function doc(): FullscreenDocument | null {
	return typeof document === "undefined" ? null : (document as FullscreenDocument);
}

/** Whether the page may enter fullscreen. */
export function isFullscreenSupported(): boolean {
	const d = doc();
	if (!d) return false;
	return d.fullscreenEnabled === true || d.webkitFullscreenEnabled === true;
}

/** The current fullscreen element, or null. */
export function currentFullscreenElement(): Element | null {
	const d = doc();
	if (!d) return null;
	return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

function reportRejection(error: unknown): void {
	// The browser can still refuse after the synchronous checks (no user gesture, permissions
	// policy). The promise is not exposed by the ref API, so the refusal goes to global reporting.
	const g = globalThis as { reportError?: (e: unknown) => void };
	if (typeof g.reportError === "function") g.reportError(error);
	else console.error(error);
}

/** Makes `el` the fullscreen element. */
export function enterFullscreen(el: HTMLElement): void {
	const target = el as FullscreenElement;
	if (typeof target.requestFullscreen === "function") {
		const result = target.requestFullscreen() as Promise<void> | undefined;
		result?.catch(reportRejection);
		return;
	}
	if (typeof target.webkitRequestFullscreen === "function") {
		target.webkitRequestFullscreen();
		return;
	}
	throw new Error("This browser does not support the Fullscreen API.");
}

/** Leaves fullscreen. */
export function leaveFullscreen(): void {
	const d = doc();
	if (!d) return;
	if (typeof d.exitFullscreen === "function") {
		const result = d.exitFullscreen() as Promise<void> | undefined;
		result?.catch(reportRejection);
	} else if (typeof d.webkitExitFullscreen === "function") {
		d.webkitExitFullscreen();
	}
}

/** Subscribes to fullscreen changes of the document. */
export function onFullscreenChange(listener: () => void): () => void {
	const d = doc();
	if (!d) return () => {};
	d.addEventListener("fullscreenchange", listener);
	d.addEventListener("webkitfullscreenchange", listener);
	return () => {
		d.removeEventListener("fullscreenchange", listener);
		d.removeEventListener("webkitfullscreenchange", listener);
	};
}
