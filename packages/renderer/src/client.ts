// `@motiojs/renderer/client`, the browser-safe counterpart of `@remotion/renderer/client`: the
// constants of Remotion's "open in editor" and coding-agent settings, with the values the
// published package exports (recorded in __oracle__/client.json). Motio's preview does not open
// editors; the constants exist so code that imports them builds and reads the same values.

/** Placeholder for the file path in a custom editor's `arguments` (`Config.setDefaultEditor()`). */
export const customEditorTargetPathPlaceholder = "%TARGET_PATH%";

/** Placeholder for the line number in a custom editor's `arguments`. */
export const customEditorLineNumberPlaceholder = "%LINE_NUMBER%";

/** Placeholder for the column number in a custom editor's `arguments`. */
export const customEditorColumnNumberPlaceholder = "%COLUMN_NUMBER%";

/** Editor ids `Config.setDefaultEditor()` accepts. */
export const defaultEditorIds: string[] = [
	"vscode",
	"cursor",
	"windsurf",
	"zed",
	"vscodium",
	"webstorm",
	"sublime-text",
];

/** Coding agent ids `Config.setDefaultCodingAgent()` accepts. */
export const defaultCodingAgentIds: string[] = ["codex", "cursor", "copilot", "claude-code"];
