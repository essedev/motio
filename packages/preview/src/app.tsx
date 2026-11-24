import type { RegisteredComposition } from "@motiojs/core/internals";
import { Player } from "@motiojs/player";
import {
	type ComponentType,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import {
	entrySignature,
	groupByFolder,
	RootCollector,
	useCompositionRegistry,
	useCompositions,
} from "./compositions.js";
import { FrameStore } from "./frame-store.js";
import {
	type CompositionSession,
	compositionFromHash,
	hashForComposition,
	type PreviewPreferences,
	readPreferences,
	readSession,
	writePreferences,
	writeSession,
	type Zoom,
} from "./persist.js";
import { formatProps, parseProps } from "./props.js";
import { FULL_RANGE, fitRange, type LoopRange, setInPoint, setOutPoint } from "./range.js";
import { isEditableTarget, SHORTCUTS, type ShortcutAction, shortcutFor } from "./shortcuts.js";
import { type RenderedStill, requestStill } from "./still.js";
import { clampFrame, formatDuration, formatFps, formatFrameCount } from "./time.js";
import { Toolbar, type ToolbarActions } from "./toolbar.js";
import { type ResolvedConfig, useResolvedComposition } from "./use-resolved.js";

/** Options of the preview page, set by the dev server. */
export interface PreviewOptions {
	/** Endpoint that renders a still through the renderer; null hides "Render still". */
	stillEndpoint: string | null;
	/** Props from `motio dev --props`, merged over each composition's default props. */
	initialProps: Record<string, unknown>;
	/** Global keyboard shortcuts. Default true. */
	keyboardShortcuts: boolean;
}

/** Debounce for props edits before `calculateMetadata()` and the Player see them. */
const PROPS_DEBOUNCE_MS = 250;
const STAGE_PADDING = 48;

function useHashSelection(): [string | null, (id: string) => void] {
	const [id, setId] = useState(() => compositionFromHash(window.location.hash));
	useEffect(() => {
		const onChange = () => setId(compositionFromHash(window.location.hash));
		window.addEventListener("hashchange", onChange);
		return () => window.removeEventListener("hashchange", onChange);
	}, []);
	const select = useCallback((next: string) => {
		window.location.hash = hashForComposition(next);
		setId(next);
	}, []);
	return [id, select];
}

/** `value` after it stopped changing for `ms`; immediately when `key` changes. */
function useDebounced<T>(value: T, ms: number, key: unknown): T {
	const [state, setState] = useState({ key, value });
	let current = state;
	if (!Object.is(state.key, key)) {
		current = { key, value };
		setState(current);
	}
	useEffect(() => {
		if (Object.is(value, current.value)) return;
		const timer = setTimeout(() => setState({ key, value }), ms);
		return () => clearTimeout(timer);
	}, [value, current.value, key, ms]);
	return current.value;
}

function useElementSize(): [(element: HTMLElement | null) => void, { w: number; h: number }] {
	const [size, setSize] = useState({ w: 0, h: 0 });
	const observer = useRef<ResizeObserver | null>(null);
	const ref = useCallback((element: HTMLElement | null) => {
		observer.current?.disconnect();
		observer.current = null;
		if (!element) return;
		const measure = () => setSize({ w: element.clientWidth, h: element.clientHeight });
		measure();
		if (typeof ResizeObserver !== "undefined") {
			observer.current = new ResizeObserver(measure);
			observer.current.observe(element);
		}
	}, []);
	return [ref, size];
}

function initialPropsText(entry: RegisteredComposition, initial: Record<string, unknown>): string {
	return formatProps({ ...entry.defaultProps, ...initial });
}

interface SelectionState extends CompositionSession {
	id: string;
}

function loadSelection(entry: RegisteredComposition, options: PreviewOptions): SelectionState {
	const saved = readSession(entry.id);
	return {
		...saved,
		id: entry.id,
		propsText: saved.propsText ?? initialPropsText(entry, options.initialProps),
	};
}

function describeComposition(entry: { width?: number | undefined; height?: number | undefined }) {
	return entry.width && entry.height ? `${entry.width}×${entry.height}` : "size from metadata";
}

function CompositionList({
	compositions,
	selectedId,
	onSelect,
}: {
	compositions: RegisteredComposition[];
	selectedId: string | null;
	onSelect(id: string): void;
}) {
	return (
		<nav aria-label="Compositions">
			{groupByFolder(compositions).map(({ folder, entries }) => (
				<div key={folder ?? ""}>
					{folder ? <div className="mp-folder">{folder}</div> : null}
					<ul className="mp-list" data-testid="composition-list">
						{entries.map((entry) => (
							<li key={entry.id}>
								<button
									type="button"
									className="mp-item"
									aria-current={entry.id === selectedId}
									data-composition-id={entry.id}
									onClick={() => onSelect(entry.id)}
								>
									<span className="mp-item-id">{entry.id}</span>
									<span className="mp-item-meta">
										{describeComposition(entry)}
										{entry.isStill
											? " · still"
											: entry.fps && entry.durationInFrames
												? ` · ${formatFps(entry.fps)} fps · ${formatDuration(entry.durationInFrames, entry.fps)}`
												: ""}
									</span>
								</button>
							</li>
						))}
					</ul>
				</div>
			))}
		</nav>
	);
}

function Shortcuts({ enabled }: { enabled: boolean }) {
	return (
		<section className="mp-section">
			<h2 className="mp-section-title">Shortcuts</h2>
			{enabled ? (
				<dl className="mp-shortcuts">
					{SHORTCUTS.map((shortcut) => (
						<div key={shortcut.label} style={{ display: "contents" }}>
							<dt>
								{shortcut.keys.map((key) => (
									<kbd key={key} className="mp-kbd">
										{key}
									</kbd>
								))}
							</dt>
							<dd>{shortcut.label}</dd>
						</div>
					))}
				</dl>
			) : (
				<p className="mp-note">Keyboard shortcuts are disabled.</p>
			)}
		</section>
	);
}

function Message({ title, children }: { title: string; children?: ReactNode }) {
	return (
		<div className="mp-message">
			<h2>{title}</h2>
			{children}
		</div>
	);
}

type StillState =
	| { status: "idle" }
	| { status: "rendering"; frame: number }
	| { status: "done"; still: RenderedStill }
	| { status: "error"; message: string };

function StillPanel({
	state,
	enabled,
	store,
	onGoTo,
	difference,
	onDifferenceChange,
}: {
	state: StillState;
	enabled: boolean;
	store: FrameStore;
	onGoTo(frame: number): void;
	difference: boolean;
	onDifferenceChange(value: boolean): void;
}) {
	const { frame } = useSyncExternalStore(store.subscribe, store.get, store.get);
	return (
		<section className="mp-section mp-still" data-testid="still-panel">
			<h2 className="mp-section-title">Render check</h2>
			{!enabled ? (
				<p className="mp-note">The renderer is not available in this session.</p>
			) : state.status === "idle" ? (
				<p className="mp-note">
					"Render still" renders the current frame through the real pipeline (as{" "}
					<code>motio still</code> does) so you can compare it with the preview.
				</p>
			) : state.status === "rendering" ? (
				<p className="mp-spinner" data-testid="still-status">
					Rendering frame {state.frame}…
				</p>
			) : state.status === "error" ? (
				<pre className="mp-error" data-testid="still-error">
					{state.message}
				</pre>
			) : (
				<>
					<img
						src={state.still.url}
						alt={`Rendered frame ${state.still.frame}`}
						data-testid="still-image"
						data-frame={state.still.frame}
					/>
					<div className="mp-still-meta">
						Frame {state.still.frame} · {state.still.width}×{state.still.height} · rendered in{" "}
						{state.still.durationMs} ms
						<br />
						{state.still.file}
					</div>
					<div className="mp-row">
						<button
							type="button"
							className="mp-btn mp-btn-small"
							aria-pressed={difference}
							title="Overlay the render on the preview with a difference blend: identical pixels turn black"
							onClick={() => onDifferenceChange(!difference)}
						>
							Difference
						</button>
						{frame !== state.still.frame ? (
							<button
								type="button"
								className="mp-btn mp-btn-small"
								onClick={() => onGoTo(state.still.frame)}
							>
								Go to frame {state.still.frame}
							</button>
						) : null}
					</div>
				</>
			)}
		</section>
	);
}

/**
 * The `motio dev` page: the compositions of the root, the selected one in a `<Player>` with
 * transport controls and a loop range, a JSON props editor validated against the schema, and a
 * render check that renders the current frame through the real pipeline.
 */
export function PreviewApp({ root, options }: { root: ComponentType; options: PreviewOptions }) {
	const registry = useCompositionRegistry();
	const compositions = useCompositions(registry);
	const [rootError, setRootError] = useState<Error | null>(null);
	const [hashId, select] = useHashSelection();
	const selected = compositions.find((c) => c.id === hashId) ?? compositions[0] ?? null;

	// Show the default selection in the URL without adding a history entry.
	useEffect(() => {
		if (selected && hashId !== selected.id) {
			window.history.replaceState(null, "", hashForComposition(selected.id));
		}
	}, [selected, hashId]);

	const [selection, setSelection] = useState<SelectionState | null>(null);
	let current = selection;
	if (selected && current?.id !== selected.id) {
		current = loadSelection(selected, options);
		setSelection(current);
	}
	const selectedId = selected?.id ?? null;
	// A new store per composition; the initial frame is read once.
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed by the composition only
	const store = useMemo(() => new FrameStore(current?.frame ?? 0), [selectedId]);

	const [preferences, setPreferences] = useState<PreviewPreferences>(readPreferences);
	const [direction, setDirection] = useState<1 | -1>(1);
	useEffect(() => writePreferences(preferences), [preferences]);
	const updatePreferences = (patch: Partial<PreviewPreferences>) =>
		setPreferences((previous) => ({ ...previous, ...patch }));

	const propsText = current?.propsText ?? "{}";
	const debouncedText = useDebounced(propsText, PROPS_DEBOUNCE_MS, selectedId);
	const schema = selected?.schema ?? null;
	const liveProps = useMemo(() => parseProps(propsText, schema), [propsText, schema]);
	// The props the Player and the renderer get: the last valid editor content. Invalid JSON
	// keeps the previous props on screen instead of blanking the preview.
	const applied = useRef<{ id: string | null; props: Record<string, unknown> }>({
		id: null,
		props: {},
	});
	// biome-ignore lint/correctness/useExhaustiveDependencies: `selected` is a new object on every render of the root; its id is the identity
	const inputProps = useMemo(() => {
		if (!selected) return null;
		const parsed = parseProps(debouncedText, null);
		if (parsed.ok) applied.current = { id: selected.id, props: parsed.props };
		else if (applied.current.id !== selected.id) {
			applied.current = {
				id: selected.id,
				props: { ...selected.defaultProps, ...options.initialProps },
			};
		}
		return applied.current.props;
	}, [debouncedText, selectedId]);

	const signature = selected ? entrySignature(selected) : "";
	const resolved = useResolvedComposition(selected, signature, inputProps);
	const config: ResolvedConfig | null =
		resolved.config && resolved.configId === selectedId ? resolved.config : null;

	const range = current?.range ?? FULL_RANGE;
	const setRange = useCallback((update: (range: LoopRange) => LoopRange) => {
		setSelection((previous) => (previous ? { ...previous, range: update(previous.range) } : null));
	}, []);
	const duration = config?.durationInFrames ?? null;
	useEffect(() => {
		if (duration !== null) setRange((r) => fitRange(r, duration));
	}, [duration, setRange]);

	// Persist the frame, range and props of the composition, also right before a reload.
	useEffect(() => {
		if (!current) return;
		const id = current.id;
		const save = () =>
			writeSession(id, { frame: store.get().frame, range, propsText: current.propsText });
		save();
		let timer: ReturnType<typeof setTimeout> | null = null;
		const unsubscribe = store.subscribe(() => {
			if (timer === null) {
				timer = setTimeout(() => {
					timer = null;
					save();
				}, 250);
			}
		});
		window.addEventListener("pagehide", save);
		return () => {
			unsubscribe();
			if (timer !== null) clearTimeout(timer);
			window.removeEventListener("pagehide", save);
			save();
		};
	}, [current, range, store]);

	const actions = useMemo((): ToolbarActions & {
		play(direction: 1 | -1): void;
		pause(): void;
		stepSeconds(seconds: number): void;
	} => {
		const last = (duration ?? 1) - 1;
		const player = () => store.current();
		const seek = (frame: number) => player()?.seekTo(clampFrame(frame, last + 1));
		return {
			toggle: () => player()?.toggle(),
			play: (dir) => {
				setDirection(dir);
				player()?.play();
			},
			pause: () => player()?.pause(),
			step: (frames) => {
				const p = player();
				if (!p) return;
				p.pause();
				seek(p.getCurrentFrame() + frames);
			},
			stepSeconds: (seconds) => {
				const p = player();
				if (!p || !config) return;
				p.pause();
				seek(p.getCurrentFrame() + Math.round(seconds * config.fps));
			},
			first: () => seek(0),
			last: () => seek(last),
			seek,
			setIn: () => setRange((r) => setInPoint(r, store.get().frame)),
			setOut: () => setRange((r) => setOutPoint(r, store.get().frame, last + 1)),
			clearRange: () => setRange(() => FULL_RANGE),
		};
	}, [duration, config, store, setRange]);

	useEffect(() => {
		if (!options.keyboardShortcuts) return;
		let handledSpace = false;
		const run = (action: ShortcutAction) => {
			switch (action.type) {
				case "toggle":
					return actions.toggle();
				case "pause":
					return actions.pause();
				case "play":
					return actions.play(action.direction);
				case "step":
					return actions.step(action.frames);
				case "stepSeconds":
					return actions.stepSeconds(action.seconds);
				case "first":
					return actions.first();
				case "last":
					return actions.last();
				case "setIn":
					return actions.setIn();
				case "setOut":
					return actions.setOut();
				case "clearRange":
					return actions.clearRange();
			}
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.defaultPrevented || isEditableTarget(e.target)) return;
			const action = shortcutFor(e);
			if (!action) return;
			e.preventDefault();
			handledSpace = e.key === " ";
			if (!e.repeat || action.type === "step" || action.type === "stepSeconds") run(action);
		};
		// A focused button would also "click" on the Space keyup and toggle a second time.
		const onKeyUp = (e: KeyboardEvent) => {
			if (e.key === " " && handledSpace) {
				handledSpace = false;
				e.preventDefault();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
		};
	}, [actions, options.keyboardShortcuts]);

	const [still, setStill] = useState<StillState>({ status: "idle" });
	const [difference, setDifference] = useState(false);
	const stillController = useRef<AbortController | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset when the composition changes
	useEffect(() => {
		stillController.current?.abort();
		setStill({ status: "idle" });
		setDifference(false);
	}, [selectedId]);
	const renderStill = async () => {
		if (!options.stillEndpoint || !selected || !inputProps) return;
		stillController.current?.abort();
		const controller = new AbortController();
		stillController.current = controller;
		const frame = store.get().frame;
		setStill({ status: "rendering", frame });
		try {
			const result = await requestStill(
				options.stillEndpoint,
				{ compositionId: selected.id, frame, inputProps },
				controller.signal,
			);
			if (!controller.signal.aborted) setStill({ status: "done", still: result });
		} catch (error) {
			if (controller.signal.aborted) return;
			setStill({
				status: "error",
				message: error instanceof Error ? error.message : String(error),
			});
		}
	};

	const [stageRef, stage] = useElementSize();
	const zoom: Zoom = preferences.zoom;
	const scale = config
		? zoom === "fit"
			? Math.max(
					0.05,
					Math.min(
						(stage.w - STAGE_PADDING) / config.width,
						(stage.h - STAGE_PADDING) / config.height,
					),
				)
			: zoom
		: 1;
	const displayWidth = config ? Math.max(1, Math.round(config.width * scale)) : 0;
	const displayHeight = config ? Math.max(1, Math.round(config.height * scale)) : 0;
	const playerStyle = useMemo(
		() => ({ width: displayWidth, height: displayHeight }),
		[displayWidth, displayHeight],
	);

	const onPropsChange = (text: string) =>
		setSelection((previous) => (previous ? { ...previous, propsText: text } : null));
	const resetProps = () => {
		if (selected) onPropsChange(initialPropsText(selected, options.initialProps));
	};

	useEffect(() => {
		document.title = selected ? `${selected.id} · Motio` : "Motio";
	}, [selected]);

	const collector = (
		<div hidden>
			<RootCollector root={root} registry={registry} onError={setRootError} />
		</div>
	);

	if (rootError) {
		return (
			<div className="mp-app">
				{collector}
				<header className="mp-header">
					<span className="mp-brand">Motio</span>
				</header>
				<main className="mp-main" style={{ gridColumn: "1 / -1" }}>
					<Message title="The root component threw">
						<pre className="mp-error">{rootError.stack ?? rootError.message}</pre>
						<p className="mp-note">Fix the error and save: the page reloads.</p>
					</Message>
				</main>
			</div>
		);
	}

	const shownMeta = config ?? selected;
	return (
		<div className="mp-app" data-testid="preview">
			{collector}
			<header className="mp-header">
				<span className="mp-brand">Motio</span>
				<div className="mp-title">
					{selected ? (
						<>
							<span className="mp-title-id" data-testid="selected-id">
								{selected.id}
							</span>
							<span className="mp-meta" data-testid="composition-meta">
								{shownMeta ? describeComposition(shownMeta) : ""}
								{selected.isStill
									? " · still"
									: config
										? ` · ${formatFps(config.fps)} fps · ${formatFrameCount(config.durationInFrames)} (${formatDuration(config.durationInFrames, config.fps)})`
										: ""}
								{resolved.pending ? " · resolving metadata…" : ""}
							</span>
						</>
					) : null}
				</div>
				{options.stillEndpoint ? (
					<button
						type="button"
						className="mp-btn mp-btn-primary"
						data-testid="render-still"
						disabled={!config || !inputProps || still.status === "rendering"}
						title="Render the current frame through the real pipeline"
						onClick={renderStill}
					>
						{still.status === "rendering" ? "Rendering…" : "Render still"}
					</button>
				) : null}
			</header>
			<aside className="mp-sidebar">
				<section className="mp-section mp-section-grow">
					<h2 className="mp-section-title">
						Compositions <span>{compositions.length}</span>
					</h2>
					{compositions.length === 0 ? (
						<p className="mp-note">None registered yet.</p>
					) : (
						<CompositionList
							compositions={compositions}
							selectedId={selectedId}
							onSelect={select}
						/>
					)}
				</section>
				<Shortcuts enabled={options.keyboardShortcuts} />
			</aside>
			<main className="mp-main">
				<div className="mp-stage" ref={stageRef}>
					{!selected ? (
						<Message title="No compositions">
							<p>
								Render a <code>&lt;Composition&gt;</code> or <code>&lt;Still&gt;</code> in the
								component passed to <code>registerRoot()</code>.
							</p>
						</Message>
					) : resolved.error && !config ? (
						<Message title="Could not resolve the composition">
							<pre className="mp-error" data-testid="resolve-error">
								{resolved.error.message}
							</pre>
						</Message>
					) : !config ? (
						<p className="mp-spinner">Resolving metadata…</p>
					) : (
						<div className="mp-stage-inner" style={playerStyle} data-testid="stage">
							<Player
								key={selected.id}
								ref={store.attach}
								component={selected.component}
								inputProps={config.props}
								durationInFrames={config.durationInFrames}
								fps={config.fps}
								compositionWidth={config.width}
								compositionHeight={config.height}
								style={playerStyle}
								controls
								loop={preferences.loop}
								playbackRate={preferences.playbackRate * direction}
								inFrame={range.inFrame}
								outFrame={range.outFrame}
								initialFrame={clampFrame(current?.frame ?? 0, config.durationInFrames)}
								spaceKeyToPlayOrPause={false}
								doubleClickToFullscreen
								errorFallback={({ error }) => (
									<pre className="mp-error" style={{ margin: 0, height: "100%" }}>
										{error.stack ?? error.message}
									</pre>
								)}
							/>
							{difference && still.status === "done" ? (
								<img className="mp-diff" src={still.still.url} alt="" />
							) : null}
						</div>
					)}
				</div>
				{config ? (
					<Toolbar
						store={store}
						actions={actions}
						fps={config.fps}
						durationInFrames={config.durationInFrames}
						range={range}
						loop={preferences.loop}
						onLoopChange={(loop) => updatePreferences({ loop })}
						playbackRate={preferences.playbackRate}
						onPlaybackRateChange={(playbackRate) => updatePreferences({ playbackRate })}
						zoom={zoom}
						onZoomChange={(next) => updatePreferences({ zoom: next })}
					/>
				) : null}
			</main>
			<aside className="mp-aside">
				<section className="mp-section">
					<h2 className="mp-section-title">
						Props
						<button
							type="button"
							className="mp-btn mp-btn-small"
							disabled={!selected}
							onClick={resetProps}
						>
							Reset
						</button>
					</h2>
					<textarea
						className="mp-textarea"
						aria-label="Input props (JSON)"
						aria-invalid={!liveProps.ok}
						data-testid="props-editor"
						spellCheck={false}
						disabled={!selected}
						value={propsText}
						onChange={(e) => onPropsChange(e.target.value)}
					/>
					{!liveProps.ok ? (
						<ul className="mp-issues mp-issues-error" data-testid="props-error">
							{liveProps.issues.map((issue) => (
								<li key={issue.message}>Invalid JSON: {issue.message}</li>
							))}
						</ul>
					) : liveProps.issues.length > 0 ? (
						<ul className="mp-issues mp-issues-warn" data-testid="props-issues">
							{liveProps.issues.map((issue) => (
								<li key={`${issue.path}:${issue.message}`}>
									{issue.path ? <code>{issue.path}</code> : "Props"}: {issue.message}
								</li>
							))}
						</ul>
					) : (
						<p className="mp-note">
							{schema ? "Matches the schema." : "No schema: props are not validated."}
						</p>
					)}
					{resolved.error && config ? (
						<pre className="mp-error" style={{ marginTop: 8 }}>
							{resolved.error.message}
						</pre>
					) : null}
				</section>
				<StillPanel
					state={still}
					enabled={options.stillEndpoint !== null}
					store={store}
					onGoTo={actions.seek}
					difference={difference}
					onDifferenceChange={setDifference}
				/>
			</aside>
		</div>
	);
}
