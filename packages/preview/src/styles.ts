/**
 * The page styles. Every rule is scoped to `mp-` classes so the user's global CSS and ours do
 * not reach into each other's elements more than global CSS always does. The palette is the
 * calm one of Motio's documentation (plum neutrals, pulse pink for the playhead, drift teal for
 * media), light and dark after the system setting.
 */
export const PREVIEW_CSS = `
.mp-app, .mp-overlay {
	--mp-bg: #f7f3f6;
	--mp-panel: #ffffff;
	--mp-stage: #ece4ea;
	--mp-border: #e2d6df;
	--mp-border-strong: #cdbbc8;
	--mp-text: #2a0e2e;
	--mp-muted: #6d5770;
	--mp-subtle: #f3edf1;
	--mp-accent: #a3124f;
	--mp-accent-text: #ffffff;
	--mp-pulse: #ff3d8b;
	--mp-current-bg: #2a0e2e;
	--mp-current-text: #f6eff4;
	--mp-danger: #a8231b;
	--mp-danger-bg: #fdeeec;
	--mp-warn: #6e4400;
	--mp-warn-bg: #fff5d9;
	--mp-warn-line: #e0b030;
	--mp-range: rgba(255, 61, 139, 0.13);
	--mp-bar: #efe3ec;
	--mp-bar-line: #d6bfd0;
	--mp-bar-line-strong: #a9849f;
	--mp-media: #d4f1ed;
	--mp-media-line: #3fa89c;
	--mp-code-bg: #faf6f9;
	--mp-focus: #a3124f;
	--mp-scrim: rgba(28, 11, 31, 0.36);
	--mp-radius: 6px;
	--mp-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
	--mp-tl-label: 168px;
	color-scheme: light dark;
	color: var(--mp-text);
	font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
	-webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
	.mp-app, .mp-overlay {
		--mp-bg: #150717;
		--mp-panel: #1c0b1f;
		--mp-stage: #0f0511;
		--mp-border: #33193a;
		--mp-border-strong: #4f3453;
		--mp-text: #f6eff4;
		--mp-muted: #bea9c1;
		--mp-subtle: #28122c;
		--mp-accent: #ff86b6;
		--mp-accent-text: #2a0e2e;
		--mp-current-bg: #f6eff4;
		--mp-current-text: #2a0e2e;
		--mp-danger: #ff9b91;
		--mp-danger-bg: #3a141a;
		--mp-warn: #ffe27a;
		--mp-warn-bg: #33270c;
		--mp-warn-line: #b38a1c;
		--mp-range: rgba(255, 61, 139, 0.2);
		--mp-bar: #33193a;
		--mp-bar-line: #55325a;
		--mp-bar-line-strong: #8d6a90;
		--mp-media: #0f3a37;
		--mp-media-line: #2fb8a8;
		--mp-code-bg: #150717;
		--mp-focus: #ff86b6;
		--mp-scrim: rgba(8, 2, 10, 0.6);
	}
}
.mp-app {
	position: fixed;
	inset: 0;
	display: grid;
	grid-template-columns: 240px minmax(0, 1fr) 340px;
	grid-template-rows: 48px minmax(0, 1fr);
	grid-template-areas: "header header header" "sidebar main aside";
	background: var(--mp-bg);
}
/* Zero specificity, like the rule the render page applies to its canvas, so a composition
   lays out the same in the Player as in a render. */
:where(.mp-app, .mp-app *, .mp-app *::before, .mp-app *::after, .mp-overlay, .mp-overlay *) { box-sizing: border-box; }
:where(.mp-app, .mp-overlay) :focus-visible { outline: 2px solid var(--mp-focus); outline-offset: 2px; }
:where(.mp-app, .mp-overlay) code { font-family: var(--mp-mono); font-size: 0.92em; }
.mp-header {
	grid-area: header;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 0 12px 0 16px;
	background: var(--mp-panel);
	border-bottom: 1px solid var(--mp-border);
	min-width: 0;
}
.mp-brand { font-weight: 700; letter-spacing: 0.01em; margin-right: 6px; }
.mp-title { display: flex; align-items: baseline; gap: 10px; min-width: 0; flex: 1; overflow: hidden; }
.mp-title-id { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: none; max-width: 100%; }
.mp-meta { color: var(--mp-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; min-width: 0; }
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
	font-size: 12px;
	font-weight: 650;
	color: var(--mp-muted);
	display: flex;
	align-items: center;
	gap: 8px;
}
.mp-section-title > .mp-btn { margin-left: auto; }
.mp-section-title:focus { outline: none; }
.mp-count {
	display: inline-block;
	min-width: 20px;
	padding: 0 6px;
	border-radius: 10px;
	background: var(--mp-subtle);
	color: var(--mp-muted);
	font: 600 11px/18px system-ui, sans-serif;
	text-align: center;
	font-variant-numeric: tabular-nums;
}
.mp-count-warn { background: var(--mp-warn-bg); color: var(--mp-warn); }
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
.mp-item[aria-current="true"] { background: var(--mp-current-bg); color: var(--mp-current-text); }
.mp-item[aria-current="true"] .mp-item-meta { color: inherit; opacity: 0.8; }
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
	border: 1px solid var(--mp-border-strong);
	border-bottom-width: 2px;
	border-radius: 4px;
	font: 11px/16px var(--mp-mono);
	text-align: center;
	background: var(--mp-subtle);
}
.mp-main { grid-area: main; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.mp-stage {
	flex: 1;
	min-height: 140px;
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
	box-shadow: 0 1px 3px rgba(42, 14, 46, 0.14), 0 10px 28px rgba(42, 14, 46, 0.1);
}
.mp-diff {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	pointer-events: none;
	mix-blend-mode: difference;
}
.mp-player-error {
	position: absolute;
	inset: 0;
	overflow: auto;
	padding: 16px;
	background: var(--mp-panel);
	color: var(--mp-text);
	font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
	text-align: left;
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
	padding: 0 9px;
	border: 1px solid var(--mp-border-strong);
	border-radius: var(--mp-radius);
	background: var(--mp-panel);
	color: inherit;
	font: inherit;
	text-decoration: none;
	cursor: pointer;
	white-space: nowrap;
	flex: none;
}
.mp-btn:hover:not(:disabled) { background: var(--mp-subtle); }
.mp-btn:disabled { opacity: 0.5; cursor: default; }
.mp-btn[aria-pressed="true"], .mp-btn[aria-expanded="true"] { background: var(--mp-range); border-color: var(--mp-accent); }
.mp-btn-icon { padding: 0; width: 28px; }
.mp-btn-quiet { border-color: transparent; font-weight: 600; padding: 0 8px 0 4px; }
.mp-btn-primary { background: var(--mp-accent); border-color: var(--mp-accent); color: var(--mp-accent-text); font-weight: 600; }
.mp-btn-primary:hover:not(:disabled) { background: var(--mp-accent); filter: brightness(1.1); }
.mp-btn-warn { background: var(--mp-warn-bg); border-color: var(--mp-warn-line); color: var(--mp-warn); font-weight: 600; }
.mp-btn-warn:hover:not(:disabled) { background: var(--mp-warn-bg); filter: brightness(0.97); }
.mp-btn-small { height: 24px; font-size: 12px; padding: 0 7px; }
.mp-btn svg { width: 14px; height: 14px; fill: currentColor; }
.mp-frame { display: flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }
.mp-frame-input {
	width: 56px;
	height: 28px;
	padding: 0 6px;
	border: 1px solid var(--mp-border-strong);
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
	border: 1px solid var(--mp-border-strong);
	border-radius: var(--mp-radius);
	background: var(--mp-panel);
	color: inherit;
	font: inherit;
}
.mp-label { color: var(--mp-muted); font-size: 12px; }
.mp-spacer { flex: 1; }

.mp-timeline {
	flex: none;
	display: flex;
	flex-direction: column;
	max-height: 34vh;
	min-height: 0;
	background: var(--mp-panel);
	border-top: 1px solid var(--mp-border);
}
.mp-tl-grid { display: grid; grid-template-columns: var(--mp-tl-label) minmax(0, 1fr); }
.mp-tl-corner {
	overflow: hidden;
	display: flex;
	align-items: center;
	padding: 0 6px;
	border-right: 1px solid var(--mp-border);
	border-bottom: 1px solid var(--mp-border);
	min-width: 0;
}
.mp-tl-toggle {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	height: 24px;
	padding: 0 6px 0 2px;
	border: 0;
	border-radius: var(--mp-radius);
	background: transparent;
	color: var(--mp-muted);
	font: 650 12px system-ui, sans-serif;
	cursor: pointer;
	min-width: 0;
}
.mp-tl-toggle:hover { color: var(--mp-text); }
.mp-tl-toggle svg { width: 12px; height: 12px; fill: currentColor; transition: transform 120ms ease; }
.mp-tl-toggle[aria-expanded="true"] svg { transform: rotate(90deg); }
.mp-tl-ruler {
	position: relative;
	height: 28px;
	overflow: hidden;
	border-bottom: 1px solid var(--mp-border);
	cursor: col-resize;
	touch-action: none;
	user-select: none;
}
.mp-tl-ruler:focus-visible { outline-offset: -2px; }
.mp-tl-tick {
	position: absolute;
	top: 0;
	bottom: 0;
	padding: 5px 0 0 4px;
	border-left: 1px solid var(--mp-border-strong);
	color: var(--mp-muted);
	font: 11px/1 var(--mp-mono);
	white-space: nowrap;
	pointer-events: none;
}
.mp-tl-range { position: absolute; top: 0; bottom: 0; background: var(--mp-range); pointer-events: none; }
.mp-tl-head {
	position: absolute;
	top: 0;
	bottom: 0;
	width: 2px;
	margin-left: -1px;
	background: var(--mp-pulse);
	pointer-events: none;
}
.mp-tl-head::before {
	content: "";
	position: absolute;
	top: 0;
	left: -4px;
	border: 5px solid transparent;
	border-top: 6px solid var(--mp-pulse);
}
.mp-tl-rows { flex: 1; min-height: 0; overflow: auto; }
.mp-tl-content { position: relative; min-height: 100%; }
.mp-tl-list { list-style: none; margin: 0; padding: 3px 0; }
.mp-tl-label {
	height: 26px;
	padding-right: 8px;
	border-right: 1px solid var(--mp-border);
	font-size: 12px;
	line-height: 26px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.mp-tl-lane { position: relative; height: 26px; cursor: col-resize; touch-action: none; }
.mp-tl-bar {
	position: absolute;
	top: 3px;
	bottom: 3px;
	min-width: 4px;
	padding: 0 6px;
	border: 1px solid var(--mp-bar-line);
	border-radius: 4px;
	background-color: var(--mp-bar);
	color: var(--mp-text);
	font: 500 11.5px/18px system-ui, sans-serif;
	text-align: left;
	cursor: pointer;
	overflow: hidden;
}
.mp-tl-bar > span { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.mp-tl-bar[data-media] { background-color: var(--mp-media); border-color: var(--mp-media-line); }
/* On screen at the playhead: a pulse edge, the fill unchanged, so a full row of active bars stays calm. */
.mp-tl-bar[data-active] { border-color: var(--mp-bar-line-strong); box-shadow: inset 3px 0 0 var(--mp-pulse); font-weight: 600; }
.mp-tl-bar[data-media][data-active] { border-color: var(--mp-media-line); box-shadow: inset 3px 0 0 var(--mp-media-line); }
.mp-tl-bar[data-hidden] { opacity: 0.55; border-style: dashed; }
.mp-tl-bar[data-cut-start] { border-left-style: dashed; border-top-left-radius: 0; border-bottom-left-radius: 0; }
.mp-tl-bar[data-cut-end] { border-right-style: dashed; border-top-right-radius: 0; border-bottom-right-radius: 0; }
.mp-tl-bar[data-loop] { background-image: linear-gradient(to right, var(--mp-bar-line) 1px, transparent 1px); background-repeat: repeat-x; }
.mp-tl-bar:focus-visible { outline-offset: 1px; z-index: 1; }
.mp-tl-playline {
	position: absolute;
	top: 0;
	bottom: 0;
	left: calc(var(--mp-tl-label) + (100% - var(--mp-tl-label)) * var(--mp-at));
	width: 2px;
	margin-left: -1px;
	background: var(--mp-pulse);
	pointer-events: none;
}
.mp-tl-empty { margin: 0; padding: 10px 14px; color: var(--mp-muted); font-size: 12px; }

.mp-textarea {
	width: 100%;
	min-height: 180px;
	resize: vertical;
	padding: 8px;
	border: 1px solid var(--mp-border-strong);
	border-radius: var(--mp-radius);
	background: var(--mp-code-bg);
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
.mp-inline-error { margin-top: 8px; }
.mp-problems { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.mp-problem { padding: 8px 10px; border-left: 3px solid var(--mp-warn-line); border-radius: 0 var(--mp-radius) var(--mp-radius) 0; background: var(--mp-warn-bg); }
.mp-problem[data-kind="cancelled"] { border-left-color: var(--mp-danger); background: var(--mp-danger-bg); }
.mp-problem-title { margin: 0; font-weight: 600; color: var(--mp-warn); overflow-wrap: anywhere; }
.mp-problem[data-kind="cancelled"] .mp-problem-title { color: var(--mp-danger); }
.mp-problem-detail { margin: 3px 0 0; font-size: 12px; overflow-wrap: anywhere; }
.mp-still img { display: block; width: 100%; height: auto; border: 1px solid var(--mp-border); border-radius: 4px; background: repeating-conic-gradient(var(--mp-subtle) 0 25%, transparent 0 50%) 0 0 / 16px 16px; }
.mp-still-meta { margin: 8px 0 0; font-size: 12px; color: var(--mp-muted); font-variant-numeric: tabular-nums; }
.mp-check { display: flex; gap: 8px; align-items: flex-start; margin-top: 12px; font-size: 12.5px; cursor: pointer; }
.mp-check input { margin: 2px 0 0; accent-color: var(--mp-accent); }
.mp-check-hint { display: block; margin-top: 2px; color: var(--mp-muted); font-size: 12px; }
.mp-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.mp-message { margin: auto; max-width: 640px; padding: 24px; text-align: center; color: var(--mp-muted); }
.mp-message h2 { margin: 0 0 10px; font-size: 15px; color: var(--mp-text); }
.mp-message .mp-error-view { margin: 0 auto; }
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
.mp-error-view {
	text-align: left;
	padding: 12px 14px;
	border-left: 3px solid var(--mp-danger);
	border-radius: 0 var(--mp-radius) var(--mp-radius) 0;
	background: var(--mp-danger-bg);
	color: var(--mp-text);
	font-size: 12.5px;
	overflow-wrap: anywhere;
}
.mp-error-title { margin: 0; font-weight: 650; color: var(--mp-danger); white-space: pre-wrap; }
.mp-error-code { display: inline-block; margin-right: 8px; font: 600 11.5px var(--mp-mono); }
.mp-error-where { margin: 4px 0 0; color: var(--mp-muted); }
.mp-error-at { margin: 8px 0 6px; }
.mp-build-message {
	margin: 8px 0 0;
	padding: 10px 12px;
	border-left: 3px solid var(--mp-danger);
	border-radius: 0 var(--mp-radius) var(--mp-radius) 0;
	background: var(--mp-danger-bg);
	color: var(--mp-text);
	font: 12px/1.5 var(--mp-mono);
	white-space: pre;
	overflow: auto;
}
.mp-error-raw { margin: 8px 0 0; font: 11.5px/1.5 var(--mp-mono); white-space: pre-wrap; color: var(--mp-muted); }
.mp-code {
	margin: 6px 0 0;
	padding: 8px 0;
	border: 1px solid var(--mp-border);
	border-radius: var(--mp-radius);
	background: var(--mp-code-bg);
	color: var(--mp-text);
	font: 12px/1.55 var(--mp-mono);
	white-space: pre;
	overflow: auto;
}
.mp-code-line { display: block; padding: 0 12px 0 0; }
.mp-code-line[data-current] { background: var(--mp-range); }
.mp-code-number { display: inline-block; padding: 0 12px 0 10px; color: var(--mp-muted); user-select: none; }
.mp-code-caret { display: block; color: var(--mp-danger); font-weight: 700; }
.mp-disclosure { margin-top: 8px; }
.mp-disclosure summary { cursor: pointer; color: var(--mp-muted); font-size: 12px; }
.mp-frames { margin: 6px 0 0; padding: 0 0 0 20px; font-size: 12px; }
.mp-frames li { margin: 2px 0; }
.mp-frame-fn { font-family: var(--mp-mono); margin-right: 8px; }
.mp-frame-file { font-family: var(--mp-mono); color: var(--mp-muted); }
.mp-spinner { color: var(--mp-muted); font-size: 12px; }
.mp-scrim { position: fixed; inset: 48px 0 0 0; z-index: 15; border: 0; padding: 0; background: var(--mp-scrim); cursor: default; }
.mp-overlay {
	position: fixed;
	inset: 0;
	z-index: 100;
	display: grid;
	align-items: start;
	justify-items: center;
	padding: 48px 16px;
	overflow: auto;
	background: var(--mp-scrim);
}
.mp-overlay-panel {
	width: min(760px, 100%);
	padding: 20px 22px;
	border-top: 4px solid var(--mp-danger);
	border-radius: 10px;
	background: var(--mp-panel);
	box-shadow: 0 18px 48px rgba(28, 11, 31, 0.3);
}
.mp-overlay-panel:focus { outline: none; }
.mp-overlay-title { margin: 0 0 4px; font-size: 17px; }

/* Narrow windows: the right panel is a drawer from the header's Props button. */
.mp-app[data-inspector-drawer] {
	grid-template-columns: 220px minmax(0, 1fr);
	grid-template-areas: "header header" "sidebar main";
}
.mp-app[data-inspector-drawer] .mp-aside,
.mp-app[data-list-drawer] .mp-sidebar {
	position: fixed;
	top: 48px;
	bottom: 0;
	z-index: 20;
	width: min(380px, 92vw);
	visibility: hidden;
	box-shadow: 0 0 32px rgba(28, 11, 31, 0.25);
	transition: transform 160ms ease, visibility 0s linear 160ms;
}
.mp-app[data-inspector-drawer] .mp-aside { right: 0; transform: translateX(100%); }
.mp-app[data-list-drawer] .mp-sidebar { left: 0; width: min(300px, 86vw); transform: translateX(-100%); }
.mp-app[data-drawer="inspector"] .mp-aside,
.mp-app[data-drawer="list"] .mp-sidebar {
	visibility: visible;
	transform: none;
	transition: transform 160ms ease;
}
/* Phones: the list is a drawer too, and the header keeps only what fits. */
.mp-app[data-list-drawer] {
	--mp-tl-label: 104px;
	grid-template-columns: minmax(0, 1fr);
	grid-template-areas: "header" "main";
}
.mp-app[data-list-drawer] .mp-header { gap: 6px; padding: 0 8px; }
.mp-app[data-list-drawer] .mp-meta { display: none; }
.mp-app[data-list-drawer] .mp-stage { padding: 12px; }
.mp-app[data-list-drawer] .mp-toolbar { gap: 6px 8px; padding: 6px 8px; }
.mp-app[data-list-drawer] .mp-spacer { display: none; }
@media (prefers-reduced-motion: reduce) {
	.mp-app *, .mp-app *::before { transition: none !important; }
}
`;
