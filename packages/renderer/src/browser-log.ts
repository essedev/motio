/** Where a console message came from, 0-based. */
export interface BrowserLogLocation {
	url?: string;
	lineNumber?: number;
	columnNumber?: number;
}

/** Console message types, as Remotion's `BrowserLog.type`. */
export type BrowserLogType =
	| "log"
	| "debug"
	| "info"
	| "error"
	| "warning"
	| "dir"
	| "dirxml"
	| "table"
	| "trace"
	| "clear"
	| "startGroup"
	| "startGroupCollapsed"
	| "endGroup"
	| "assert"
	| "profile"
	| "profileEnd"
	| "count"
	| "timeEnd"
	| "verbose";

/**
 * A console message, uncaught exception or unhandled rejection from the page, passed to
 * `onBrowserLog`. Uncaught exceptions and rejections arrive with type `error`.
 */
export interface BrowserLog {
	text: string;
	stackTrace: BrowserLogLocation[];
	type: BrowserLogType;
}
