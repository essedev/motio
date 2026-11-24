import { useEffect, useRef, useSyncExternalStore } from "react";
import { ErrorView } from "./error-view.js";

/** A build error as the dev server reports it (Vite's error payload), or a failed import. */
export interface BuildError {
	message: string;
	stack?: string;
	/** File that failed, with line and column. */
	loc?: { file?: string; line: number; column: number };
	id?: string;
	/** Code frame around the error. */
	frame?: string;
	plugin?: string;
}

/** The page module dispatches these on `window` (see the bundler's preview entry). */
export const BUILD_ERROR_EVENT = "motio:build-error";
export const BUILD_OK_EVENT = "motio:build-ok";

/** Dynamic import failures say nothing useful; the server's payload for the same file does. */
const GENERIC_IMPORT_FAILURE =
	/Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

/** Holds the current build error; a precise one is never replaced by a generic import failure. */
export class BuildErrorStore {
	private error: BuildError | null = null;
	private readonly listeners = new Set<() => void>();

	/** Listens on `window`; returns the function that stops. */
	listen(): () => void {
		const onError = (event: Event) => this.set(toBuildError((event as CustomEvent).detail));
		const onOk = () => this.set(null);
		window.addEventListener(BUILD_ERROR_EVENT, onError);
		window.addEventListener(BUILD_OK_EVENT, onOk);
		return () => {
			window.removeEventListener(BUILD_ERROR_EVENT, onError);
			window.removeEventListener(BUILD_OK_EVENT, onOk);
		};
	}

	set(error: BuildError | null): void {
		if (
			error &&
			this.error &&
			GENERIC_IMPORT_FAILURE.test(error.message) &&
			!GENERIC_IMPORT_FAILURE.test(this.error.message)
		) {
			return;
		}
		this.error = error;
		for (const listener of [...this.listeners]) listener();
	}

	get = (): BuildError | null => this.error;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};
}

function toBuildError(detail: unknown): BuildError {
	const d = (detail ?? {}) as Partial<BuildError>;
	// The dev server's errors carry the file (id, loc) or the plugin; their stack is Vite's own,
	// on the server. Only an error thrown in the page keeps its stack.
	const fromServer =
		typeof d.id === "string" || d.loc !== undefined || typeof d.plugin === "string";
	return {
		message: typeof d.message === "string" ? d.message : String(detail),
		...(typeof d.stack === "string" && !fromServer ? { stack: d.stack } : {}),
		...(d.loc && typeof d.loc.line === "number" ? { loc: d.loc } : {}),
		...(typeof d.id === "string" ? { id: d.id } : {}),
		...(typeof d.frame === "string" ? { frame: d.frame } : {}),
		...(typeof d.plugin === "string" ? { plugin: d.plugin } : {}),
	};
}

/** The file of a build error, relative to the project when the page can tell. */
function errorFile(error: BuildError): string | null {
	const file = error.loc?.file ?? error.id ?? null;
	if (!file) return null;
	const clean = file.split("?")[0] as string;
	return error.loc ? `${clean}:${error.loc.line}:${error.loc.column}` : clean;
}

/**
 * The message without the file path the compiler repeats in front of it, and without ANSI
 * colours.
 */
function cleanMessage(error: BuildError): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: strips ANSI escape sequences
	let message = error.message.replace(/\u001b\[[0-9;]*m/g, "");
	const file = error.loc?.file ?? error.id;
	if (file && message.startsWith(file)) message = message.slice(file.length).replace(/^[:\s]+/, "");
	return message
		.replace(/^Transform failed with \d+ errors?:\s*/, "")
		.replace(/^\[plugin [\w:-]+\]\s*/, "")
		.trim();
}

/**
 * Shown over the page while the project does not build: a syntax error, an import that does not
 * resolve, a module that throws while loading. Replaces Vite's overlay, which names Vite's
 * configuration file, with the file, the code and what to do. Hidden by saving a fix.
 */
export function BuildErrorOverlay({ store }: { store: BuildErrorStore }) {
	const error = useSyncExternalStore(store.subscribe, store.get, store.get);
	const panel = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		if (error) panel.current?.focus();
	}, [error]);
	if (!error) return null;
	const file = errorFile(error);
	const isSyntax = /PARSE_ERROR|SyntaxError|Unexpected token|Expected /.test(error.message);
	const generic = GENERIC_IMPORT_FAILURE.test(error.message);
	return (
		<div className="mp-overlay" data-testid="build-error">
			<div
				className="mp-overlay-panel"
				role="alertdialog"
				aria-modal="false"
				aria-labelledby="mp-build-error-title"
				tabIndex={-1}
				ref={panel}
			>
				<h2 id="mp-build-error-title" className="mp-overlay-title">
					{isSyntax ? "Syntax error" : "The project does not build"}
				</h2>
				{file ? (
					<p className="mp-error-at">
						<code>{file}</code>
					</p>
				) : null}
				{error.stack && !error.frame && !generic ? (
					<ErrorView
						error={Object.assign(new Error(cleanMessage(error)), { stack: error.stack })}
					/>
				) : (
					<pre className="mp-build-message">{cleanMessage(error)}</pre>
				)}
				{error.frame ? <pre className="mp-code">{error.frame.replace(/\t/g, "  ")}</pre> : null}
				<p className="mp-note">
					{generic
						? "A module of the project could not be loaded. The terminal running motio dev shows why."
						: "Fix the file and save: the preview updates by itself."}
				</p>
				<div className="mp-row">
					<button type="button" className="mp-btn mp-btn-small" onClick={() => store.set(null)}>
						Hide until the next error
					</button>
				</div>
			</div>
		</div>
	);
}
