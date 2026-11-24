import { getRoot, waitForRoot } from "@motiojs/core/internals";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PreviewApp, type PreviewOptions } from "./app.js";
import { BuildErrorOverlay, BuildErrorStore } from "./build-error.js";
import { PREVIEW_CSS } from "./styles.js";

/** Options of {@link mountPreview}; every field has a default. */
export interface MountPreviewOptions extends Partial<PreviewOptions> {
	/** Element the page renders into. Defaults to `#motio-preview`, else `document.body`. */
	container?: HTMLElement;
}

const STYLE_ID = "motio-preview-style";
const ROOT_WAIT_NOTICE_MS = 3000;

/**
 * Mounts the preview page once the entry file called `registerRoot()`. Called by the page
 * module the dev server generates, after it imported the user's entry file.
 */
export async function mountPreview(options: MountPreviewOptions = {}): Promise<Root> {
	// First, before any await: the page module loads the user's entry right after this call,
	// and a build error in it is reported as an event this store must already hear.
	const buildErrors = new BuildErrorStore();
	buildErrors.listen();
	if (!document.getElementById(STYLE_ID)) {
		const style = document.createElement("style");
		style.id = STYLE_ID;
		style.textContent = PREVIEW_CSS;
		document.head.appendChild(style);
	}
	const container = options.container ?? document.getElementById("motio-preview") ?? document.body;
	const reactRoot = createRoot(container);
	const show = (content: ReactNode) =>
		reactRoot.render(
			<>
				{content}
				<BuildErrorOverlay store={buildErrors} />
			</>,
		);
	show(null);
	let root = getRoot();
	if (!root) {
		// The entry may register the root after asynchronous work; say so if it takes long.
		const timer = setTimeout(() => {
			show(
				<div className="mp-app" style={{ display: "flex" }}>
					<div className="mp-message">
						<h2>Waiting for registerRoot()</h2>
						<p>
							The entry file has not called <code>registerRoot()</code> yet. Call it with the
							component that renders your compositions.
						</p>
					</div>
				</div>,
			);
		}, ROOT_WAIT_NOTICE_MS);
		root = await waitForRoot();
		clearTimeout(timer);
	}
	show(
		<PreviewApp
			root={root}
			options={{
				stillEndpoint: options.stillEndpoint ?? null,
				initialProps: options.initialProps ?? {},
				keyboardShortcuts: options.keyboardShortcuts ?? true,
			}}
		/>,
	);
	return reactRoot;
}
