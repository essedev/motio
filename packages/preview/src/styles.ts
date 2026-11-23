/**
 * The page styles. Every rule is scoped to `mp-` classes so the user's global CSS and ours do
 * not reach into each other's elements more than global CSS always does.
 */
export const PREVIEW_CSS = `
.mp-app {
	--mp-bg: #f6f6f7;
	--mp-panel: #ffffff;
	--mp-stage: #e9e9ec;
	--mp-border: #dedee3;
	--mp-text: #1d1d22;
	--mp-muted: #6b6b76;
	--mp-subtle: #f0f0f2;
	--mp-accent: #2f6fde;
	--mp-accent-text: #ffffff;
	--mp-danger: #c4352b;
	--mp-danger-bg: #fbeceb;
	--mp-warn: #8a5a00;
	--mp-warn-bg: #fdf4e3;
	--mp-range: rgba(47, 111, 222, 0.14);
	--mp-radius: 6px;
	--mp-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
	color-scheme: light dark;
	position: fixed;
	inset: 0;
	display: grid;
	grid-template-columns: 240px minmax(0, 1fr) 320px;
	grid-template-rows: 48px minmax(0, 1fr);
	grid-template-areas: "header header header" "sidebar main aside";
	background: var(--mp-bg);
	color: var(--mp-text);
	font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
	-webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
	.mp-app {
		--mp-bg: #17171a;
		--mp-panel: #1e1e22;
		--mp-stage: #111113;
		--mp-border: #2e2e34;
		--mp-text: #ececf0;
		--mp-muted: #9a9aa6;
		--mp-subtle: #26262b;
		--mp-accent: #5b8ff0;
		--mp-danger: #f07167;
		--mp-danger-bg: #3a1f1d;
		--mp-warn: #f0c060;
		--mp-warn-bg: #3a3020;
		--mp-range: rgba(91, 143, 240, 0.2);
	}
}
/* Zero specificity, like the rule the render page applies to its canvas, so a composition
   lays out the same in the Player as in a render. */
:where(.mp-app, .mp-app *, .mp-app *::before, .mp-app *::after) { box-sizing: border-box; }
.mp-header {
	grid-area: header;
	display: flex;
	align-items: center;
	gap: 16px;
	padding: 0 16px;
	background: var(--mp-panel);
	border-bottom: 1px solid var(--mp-border);
	min-width: 0;
}
.mp-brand { font-weight: 650; letter-spacing: 0.01em; }
.mp-title { display: flex; align-items: baseline; gap: 10px; min-width: 0; flex: 1; }
.mp-title-id { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mp-meta { color: var(--mp-muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
.mp-sidebar, .mp-aside {
	background: var(--mp-panel);
	overflow: auto;
	display: flex;
	flex-direction: column;
	min-height: 0;
}
.mp-sidebar { grid-area: sidebar; border-right: 1px solid var(--mp-border); }
.mp-aside { grid-area: aside; border-left: 1px solid var(--mp-border); }
.mp-section { padding: 14px 14px 16px; border-bottom: 1px solid var(--mp-border); }
.mp-section:last-child { border-bottom: 0; }
.mp-section-grow { flex: 1; }
.mp-section-title {
	margin: 0 0 8px;
	font-size: 11px;
	font-weight: 600;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: var(--mp-muted);
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}
.mp-list { list-style: none; margin: 0; padding: 0; }
.mp-folder { margin: 10px 0 4px; color: var(--mp-muted); font-size: 12px; }
.mp-item {
	display: block;
	width: 100%;
	text-align: left;
	border: 0;
	background: transparent;
	color: inherit;
	font: inherit;
	padding: 6px 8px;
	border-radius: var(--mp-radius);
	cursor: pointer;
}
.mp-item:hover { background: var(--mp-subtle); }
.mp-item[aria-current="true"] { background: var(--mp-accent); color: var(--mp-accent-text); }
.mp-item[aria-current="true"] .mp-item-meta { color: inherit; opacity: 0.85; }
.mp-item-id { display: block; font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mp-item-meta { display: block; font-size: 11.5px; color: var(--mp-muted); font-variant-numeric: tabular-nums; }
.mp-shortcuts { display: grid; grid-template-columns: auto 1fr; gap: 6px 10px; margin: 0; font-size: 12px; }
.mp-shortcuts dt { white-space: nowrap; }
.mp-shortcuts dd { margin: 0; color: var(--mp-muted); }
.mp-kbd {
	display: inline-block;
	min-width: 18px;
	padding: 0 4px;
	margin-right: 2px;
	border: 1px solid var(--mp-border);
	border-bottom-width: 2px;
	border-radius: 4px;
	font: 11px/16px var(--mp-mono);
	text-align: center;
	background: var(--mp-subtle);
}
.mp-main { grid-area: main; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.mp-stage {
	flex: 1;
	min-height: 0;
	overflow: auto;
	background: var(--mp-stage);
	display: grid;
	place-items: center;
	padding: 24px;
}
/* The composition must not inherit the page's font, colour or line height: a render page has
   none of them, so reset every inherited property to its initial value, as on a bare page. */
.mp-stage-inner {
	all: initial;
	display: block;
	position: relative;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 8px 24px rgba(0, 0, 0, 0.08);
}
.mp-diff {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	pointer-events: none;
	mix-blend-mode: difference;
}
.mp-toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px 12px;
	padding: 8px 12px;
	background: var(--mp-panel);
	border-top: 1px solid var(--mp-border);
}
.mp-group { display: flex; align-items: center; gap: 4px; }
.mp-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	height: 28px;
	min-width: 28px;
	padding: 0 8px;
	border: 1px solid var(--mp-border);
	border-radius: var(--mp-radius);
	background: var(--mp-panel);
	color: inherit;
	font: inherit;
	cursor: pointer;
	white-space: nowrap;
}
.mp-btn:hover:not(:disabled) { background: var(--mp-subtle); }
.mp-btn:disabled { opacity: 0.5; cursor: default; }
.mp-btn[aria-pressed="true"] { background: var(--mp-range); border-color: var(--mp-accent); }
.mp-btn-icon { padding: 0; width: 28px; }
.mp-btn-primary { background: var(--mp-accent); border-color: var(--mp-accent); color: var(--mp-accent-text); }
.mp-btn-primary:hover:not(:disabled) { background: var(--mp-accent); filter: brightness(1.08); }
.mp-btn-small { height: 24px; font-size: 12px; padding: 0 6px; }
.mp-btn svg { width: 14px; height: 14px; fill: currentColor; }
.mp-frame { display: flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }
.mp-frame-input {
	width: 56px;
	height: 28px;
	padding: 0 6px;
	border: 1px solid var(--mp-border);
	border-radius: var(--mp-radius);
	background: var(--mp-panel);
	color: inherit;
	font: 13px var(--mp-mono);
	text-align: right;
}
.mp-timecode { font-family: var(--mp-mono); color: var(--mp-muted); }
.mp-range-label { font-family: var(--mp-mono); font-size: 12px; color: var(--mp-muted); min-width: 24px; }
.mp-select {
	height: 28px;
	padding: 0 6px;
	border: 1px solid var(--mp-border);
	border-radius: var(--mp-radius);
	background: var(--mp-panel);
	color: inherit;
	font: inherit;
}
.mp-label { color: var(--mp-muted); font-size: 12px; }
.mp-spacer { flex: 1; }
.mp-textarea {
	width: 100%;
	min-height: 180px;
	resize: vertical;
	padding: 8px;
	border: 1px solid var(--mp-border);
	border-radius: var(--mp-radius);
	background: var(--mp-bg);
	color: inherit;
	font: 12px/1.5 var(--mp-mono);
	tab-size: 2;
}
.mp-textarea[aria-invalid="true"] { border-color: var(--mp-danger); }
.mp-note { margin: 8px 0 0; font-size: 12px; color: var(--mp-muted); }
.mp-issues { list-style: none; margin: 8px 0 0; padding: 8px 10px; border-radius: var(--mp-radius); font-size: 12px; }
.mp-issues li + li { margin-top: 4px; }
.mp-issues-error { background: var(--mp-danger-bg); color: var(--mp-danger); }
.mp-issues-warn { background: var(--mp-warn-bg); color: var(--mp-warn); }
.mp-issues code { font-family: var(--mp-mono); }
.mp-still img { display: block; width: 100%; height: auto; border: 1px solid var(--mp-border); border-radius: 4px; background: repeating-conic-gradient(var(--mp-subtle) 0 25%, transparent 0 50%) 0 0 / 16px 16px; }
.mp-still-meta { margin-top: 8px; font-size: 12px; color: var(--mp-muted); font-variant-numeric: tabular-nums; word-break: break-all; }
.mp-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.mp-message { margin: auto; max-width: 560px; padding: 24px; text-align: center; color: var(--mp-muted); }
.mp-message h2 { margin: 0 0 8px; font-size: 15px; color: var(--mp-text); }
.mp-error {
	margin: 0;
	padding: 12px 14px;
	border-radius: var(--mp-radius);
	background: var(--mp-danger-bg);
	color: var(--mp-danger);
	font: 12px/1.5 var(--mp-mono);
	white-space: pre-wrap;
	text-align: left;
	overflow: auto;
	max-height: 50vh;
}
.mp-spinner { color: var(--mp-muted); font-size: 12px; }
@media (max-width: 960px) {
	.mp-app { grid-template-columns: 200px minmax(0, 1fr); grid-template-areas: "header header" "sidebar main"; }
	.mp-aside { display: none; }
}
`;
