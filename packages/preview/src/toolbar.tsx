import { type KeyboardEvent, useEffect, useState, useSyncExternalStore } from "react";
import type { FrameStore } from "./frame-store.js";
import { Icons } from "./icons.js";
import { PLAYBACK_RATES, ZOOM_LEVELS, type Zoom } from "./persist.js";
import type { LoopRange } from "./range.js";
import { clampFrame, formatTimecode } from "./time.js";

/** Actions the toolbar triggers; implemented by the page against the Player. */
export interface ToolbarActions {
	toggle(): void;
	step(frames: number): void;
	first(): void;
	last(): void;
	seek(frame: number): void;
	setIn(): void;
	setOut(): void;
	clearRange(): void;
}

interface ToolbarProps {
	store: FrameStore;
	actions: ToolbarActions;
	fps: number;
	durationInFrames: number;
	range: LoopRange;
	loop: boolean;
	onLoopChange(loop: boolean): void;
	playbackRate: number;
	onPlaybackRateChange(rate: number): void;
	zoom: Zoom;
	onZoomChange(zoom: Zoom): void;
}

const zoomLabel = (zoom: Zoom) => (zoom === "fit" ? "Fit" : `${zoom * 100}%`);

/** Frame input: shows the current frame, seeks on Enter or blur. */
function FrameInput({
	frame,
	durationInFrames,
	onSeek,
}: {
	frame: number;
	durationInFrames: number;
	onSeek(frame: number): void;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const commit = () => {
		if (draft === null) return;
		const value = Number(draft);
		setDraft(null);
		if (draft.trim() !== "" && Number.isFinite(value)) onSeek(clampFrame(value, durationInFrames));
	};
	const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			commit();
			e.currentTarget.blur();
		} else if (e.key === "Escape") {
			setDraft(null);
			e.currentTarget.blur();
		}
	};
	return (
		<input
			className="mp-frame-input"
			aria-label="Current frame"
			data-testid="frame-input"
			inputMode="numeric"
			value={draft ?? String(frame)}
			onChange={(e) => setDraft(e.target.value)}
			onFocus={(e) => {
				setDraft(String(frame));
				e.target.select();
			}}
			onBlur={commit}
			onKeyDown={onKeyDown}
		/>
	);
}

/**
 * Transport and range controls under the stage: stepping, the frame counter and timecode,
 * the loop range, rate and zoom. Subscribes to the frame store itself, so playback re-renders
 * only this bar.
 */
export function Toolbar(props: ToolbarProps) {
	const { store, actions, fps, durationInFrames, range } = props;
	const { frame, playing } = useSyncExternalStore(store.subscribe, store.get, store.get);
	const last = durationInFrames - 1;
	// Keep the counter inside the composition after its duration shrank.
	useEffect(() => {
		if (frame > last) actions.seek(last);
	}, [frame, last, actions]);
	return (
		<div className="mp-toolbar" role="toolbar" aria-label="Playback">
			<div className="mp-group">
				<button
					type="button"
					className="mp-btn mp-btn-icon"
					title="First frame (Home)"
					onClick={actions.first}
				>
					{Icons.first}
				</button>
				<button
					type="button"
					className="mp-btn mp-btn-icon"
					title="Previous frame (←)"
					onClick={() => actions.step(-1)}
				>
					{Icons.stepBack}
				</button>
				<button
					type="button"
					className="mp-btn mp-btn-icon"
					title={playing ? "Pause (Space)" : "Play (Space)"}
					data-testid="play-toggle"
					onClick={actions.toggle}
				>
					{playing ? Icons.pause : Icons.play}
				</button>
				<button
					type="button"
					className="mp-btn mp-btn-icon"
					title="Next frame (→)"
					onClick={() => actions.step(1)}
				>
					{Icons.stepForward}
				</button>
				<button
					type="button"
					className="mp-btn mp-btn-icon"
					title="Last frame (End)"
					onClick={actions.last}
				>
					{Icons.last}
				</button>
			</div>
			<div className="mp-frame">
				<FrameInput frame={frame} durationInFrames={durationInFrames} onSeek={actions.seek} />
				<span className="mp-label" data-testid="frame-total">
					/ {last}
				</span>
				<span
					className="mp-timecode"
					data-testid="timecode"
					title="Timecode: hours, minutes, seconds and frames (HH:MM:SS:FF)"
				>
					{formatTimecode(Math.min(frame, last), fps)}
				</span>
			</div>
			<div className="mp-group">
				<button
					type="button"
					className="mp-btn mp-btn-small"
					title="Set the in point at the current frame (I)"
					onClick={actions.setIn}
				>
					In
				</button>
				<span className="mp-range-label" data-testid="in-frame">
					{range.inFrame ?? 0}
				</span>
				<button
					type="button"
					className="mp-btn mp-btn-small"
					title="Set the out point at the current frame (O)"
					onClick={actions.setOut}
				>
					Out
				</button>
				<span className="mp-range-label" data-testid="out-frame">
					{range.outFrame ?? last}
				</span>
				<button
					type="button"
					className="mp-btn mp-btn-small"
					title="Clear the loop range (X)"
					disabled={range.inFrame === null && range.outFrame === null}
					onClick={actions.clearRange}
				>
					Clear
				</button>
				<button
					type="button"
					className="mp-btn mp-btn-small"
					aria-pressed={props.loop}
					title="Loop playback"
					onClick={() => props.onLoopChange(!props.loop)}
				>
					Loop
				</button>
			</div>
			<span className="mp-spacer" />
			<label className="mp-group" title="Playback speed">
				<select
					className="mp-select"
					aria-label="Playback speed"
					value={props.playbackRate}
					onChange={(e) => props.onPlaybackRateChange(Number(e.target.value))}
				>
					{PLAYBACK_RATES.map((rate) => (
						<option key={rate} value={rate}>
							{rate}×
						</option>
					))}
				</select>
			</label>
			<label className="mp-group" title="Zoom">
				<select
					className="mp-select"
					aria-label="Zoom"
					data-testid="zoom"
					value={String(props.zoom)}
					onChange={(e) =>
						props.onZoomChange(e.target.value === "fit" ? "fit" : Number(e.target.value))
					}
				>
					{ZOOM_LEVELS.map((zoom) => (
						<option key={String(zoom)} value={String(zoom)}>
							{zoomLabel(zoom)}
						</option>
					))}
				</select>
			</label>
		</div>
	);
}
