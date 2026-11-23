// Page side of record-preload.ts: calls the published @remotion/preload in the pinned Chrome and
// returns plain data (public API only). Bundled with esbuild.
import {
	preloadAudio,
	preloadFont,
	preloadImage,
	preloadVideo,
	resolveRedirect,
} from "@remotion/preload";

const FUNCTIONS = { preloadAudio, preloadFont, preloadImage, preloadVideo } as const;

export interface PreloadProbeSpec {
	/** Function name and URL of each case. */
	cases: Array<{ fn: keyof typeof FUNCTIONS; url: string }>;
	/** URLs passed to resolveRedirect(). */
	redirects: string[];
	/** How long to wait for the preload to settle, in ms. */
	waitMs: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Elements of head and body, as markup, minus the probe's own script. */
const snapshot = () =>
	[...document.head.children, ...document.body.children]
		.filter((e) => e.tagName !== "SCRIPT")
		.map((e) => ({
			parent: e.parentElement === document.head ? "head" : "body",
			html: e.outerHTML,
			// Properties a media element has that its markup does not show.
			...(e instanceof HTMLMediaElement
				? { preload: e.preload, src: e.src, muted: e.muted, autoplay: e.autoplay }
				: {}),
			...(e instanceof HTMLLinkElement
				? { as: e.as, href: e.href, crossOrigin: e.crossOrigin }
				: {}),
		}));

const message = (error: unknown) =>
	error instanceof Error ? { name: error.name, message: error.message } : { value: String(error) };

/** Console calls made while `fn` runs and for `waitMs` after. */
async function watchConsole<T>(
	fn: () => T,
	waitMs: number,
): Promise<{ result: T; logs: unknown[] }> {
	const logs: unknown[] = [];
	const original = {
		log: console.log,
		warn: console.warn,
		error: console.error,
		info: console.info,
	};
	for (const level of Object.keys(original) as (keyof typeof original)[]) {
		console[level] = (...args: unknown[]) => {
			logs.push({ level, args: args.map((a) => (a instanceof Error ? message(a) : String(a))) });
		};
	}
	try {
		const result = fn();
		await sleep(waitMs);
		return { result, logs };
	} finally {
		Object.assign(console, original);
	}
}

export async function runPreloadProbe(spec: PreloadProbeSpec) {
	const cases = [];
	for (const [index, { fn, url }] of spec.cases.entries()) {
		// Marks the server log, so requests can be attributed to cases.
		await fetch(`/__mark/case/${index}`);
		const before = snapshot().length;
		const called = await watchConsole(() => FUNCTIONS[fn](url), spec.waitMs);
		const unpreload = called.result;
		const added = snapshot().slice(before);
		const removed = await watchConsole(() => unpreload(), 50);
		const afterFree = snapshot().length - before;
		// Freeing twice must not throw.
		let secondFree: unknown = "ok";
		try {
			unpreload();
		} catch (e) {
			secondFree = message(e);
		}
		cases.push({
			fn,
			url,
			returns: typeof unpreload,
			returnsUndefinedOnCall: removed.result === undefined,
			added,
			logs: called.logs,
			logsOnFree: removed.logs,
			leftAfterFree: afterFree,
			secondFree,
		});
	}

	// Freed before the redirect check finished: is anything added afterwards?
	const early = [];
	for (const fn of Object.keys(FUNCTIONS) as (keyof typeof FUNCTIONS)[]) {
		await fetch(`/__mark/early/${fn}`);
		const before = snapshot().length;
		const { logs } = await watchConsole(() => FUNCTIONS[fn]("/slow/ok")(), spec.waitMs * 3);
		early.push({ fn, leftAfterFree: snapshot().length - before, logs });
	}

	// The same URL twice: two elements, freed independently?
	const twice = [];
	for (const fn of Object.keys(FUNCTIONS) as (keyof typeof FUNCTIONS)[]) {
		const before = snapshot().length;
		const a = FUNCTIONS[fn]("/media/twice");
		const b = FUNCTIONS[fn]("/media/twice");
		await sleep(spec.waitMs);
		const both = snapshot().length - before;
		a();
		const afterFirst = snapshot().length - before;
		b();
		twice.push({ fn, both, afterFirst, afterBoth: snapshot().length - before });
	}

	const redirects = [];
	for (const url of spec.redirects) {
		await fetch(`/__mark/redirect/${encodeURIComponent(url)}`);
		try {
			redirects.push({ url, resolved: await resolveRedirect(url) });
		} catch (e) {
			redirects.push({
				url,
				error: message(e),
				errorClass: e instanceof TypeError ? "TypeError" : e instanceof Error ? "Error" : "other",
			});
		}
	}
	return { cases, early, twice, redirects };
}
