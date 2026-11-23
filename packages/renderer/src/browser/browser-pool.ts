import type { Browser } from "puppeteer-core";

/**
 * Pages sharing one browser process when the caller does not choose (D-042): the pages are spread
 * over two browsers, and over more of four pages each above concurrency 8. One browser draws its
 * pages' frames through one compositor, which saturates; every further browser process costs CPU
 * the encoder needs. Measured end to end at 1080p on 10 CPU threads, two browsers render fastest at
 * concurrency 2, 4, 6 and 8 (at 8: 0.73 s against 0.83 s with four browsers of two and 1.09 s with
 * eight browsers).
 */
export function defaultPagesPerBrowser(concurrency: number): number {
	return Math.max(1, Math.min(4, Math.ceil(concurrency / 2)));
}

/** A page slot on a pooled browser. */
export interface BrowserLease {
	browser: Browser;
	/**
	 * True the first time it is called on a fresh browser: the caller then uses the tab the browser
	 * opened at launch instead of creating one.
	 */
	takeInitialTab(): boolean;
	/** Gives the slot back; the browser stays open for the next page. */
	release(): void;
	/** Kills the browser (all its pages), for a page that cannot be closed normally. */
	kill(): Promise<void>;
}

interface Host {
	key: string;
	browser: Promise<Browser>;
	/** Slots taken, counted when a lease is handed out, before the browser finished launching. */
	pages: number;
	initialTabFree: boolean;
	dead: boolean;
}

/**
 * Browser processes shared by the pages of one session (D-042). Pages with the same launch key
 * share a browser up to `pagesPerBrowser`; a browser that crashes or is killed leaves the pool, and
 * the next lease launches a new one. `close()` kills every browser and resolves when their
 * processes have exited.
 */
export class BrowserPool {
	private readonly hosts: Host[] = [];
	private readonly launched = new Set<Promise<Browser>>();
	private closed = false;

	/**
	 * Hands out a slot on a live browser with this launch key and room for another page, launching
	 * one if none has room.
	 */
	async lease(
		key: string,
		pagesPerBrowser: number,
		launch: () => Promise<Browser>,
	): Promise<BrowserLease> {
		if (this.closed) throw new Error("The browser pool is closed");
		let host = this.hosts.find((h) => h.key === key && !h.dead && h.pages < pagesPerBrowser);
		if (!host) {
			const browser = launch();
			const created: Host = { key, browser, pages: 0, initialTabFree: true, dead: false };
			host = created;
			this.hosts.push(created);
			this.launched.add(browser);
			browser.then(
				(b) => {
					b.once("disconnected", () => this.retire(created));
					// A lease handed out after close() started: the browser must not outlive the pool.
					if (this.closed) void killBrowser(b);
				},
				() => {
					this.launched.delete(browser);
					this.retire(created);
				},
			);
		}
		const h = host;
		h.pages++;
		let browser: Browser;
		try {
			browser = await h.browser;
		} catch (err) {
			h.pages--;
			throw err;
		}
		let released = false;
		return {
			browser,
			takeInitialTab: () => {
				const free = h.initialTabFree;
				h.initialTabFree = false;
				return free;
			},
			release: () => {
				if (released) return;
				released = true;
				h.pages--;
			},
			kill: async () => {
				this.retire(h);
				await killBrowser(browser);
			},
		};
	}

	/** Browsers launched and still in the pool, for diagnostics and tests. */
	get size(): number {
		return this.hosts.length;
	}

	private retire(host: Host): void {
		host.dead = true;
		const i = this.hosts.indexOf(host);
		if (i >= 0) this.hosts.splice(i, 1);
	}

	/** Kills every browser the pool launched and waits for the processes to exit. */
	async close(): Promise<void> {
		this.closed = true;
		this.hosts.length = 0;
		const all = [...this.launched];
		this.launched.clear();
		await Promise.all(
			all.map((p) =>
				p.then(
					(b) => killBrowser(b),
					() => undefined,
				),
			),
		);
	}
}

/**
 * Closes a browser gracefully for up to 3 s, then kills its process. A browser that already
 * crashed rejects `close()`; the kill below is what guarantees the process is gone, so that
 * rejection carries no information and is not rethrown.
 */
export async function killBrowser(browser: Browser): Promise<void> {
	const proc = browser.process();
	await Promise.race([
		browser.close().catch(() => undefined),
		new Promise((ok) => setTimeout(ok, 3_000)),
	]);
	if (proc && proc.exitCode === null && proc.signalCode === null) {
		proc.kill("SIGKILL");
		await new Promise<void>((ok) => {
			if (proc.exitCode !== null || proc.signalCode !== null) ok();
			else proc.once("exit", () => ok());
		});
	}
}
