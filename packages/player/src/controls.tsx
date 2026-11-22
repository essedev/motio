import {
	type CSSProperties,
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { playbackRange } from "./frame-math.js";
import type { PlaybackStore } from "./playback-store.js";
import type {
	PlayerGestureEvent,
	RenderCustomControls,
	RenderFullscreenButton,
	RenderMuteButton,
	RenderPlayPauseButton,
	RenderVolumeSlider,
} from "./types.js";

/** The rates `showPlaybackRateControl={true}` offers. */
export const DEFAULT_PLAYBACK_RATES = [0.5, 0.8, 1, 1.2, 1.5, 1.8, 2, 2.5, 3];

/** Formats a frame as `m:ss`, or `h:mm:ss` past an hour. */
export function formatTime(frame: number, fps: number): string {
	const total = Math.floor(frame / fps);
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const seconds = total % 60;
	const ss = String(seconds).padStart(2, "0");
	if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
	return `${minutes}:${ss}`;
}

const ICON = 24;

function PlayIcon(): ReactNode {
	return (
		<svg width={ICON} height={ICON} viewBox="0 0 24 24" aria-hidden="true">
			<path d="M7 4.5v15l12.5-7.5z" fill="white" />
		</svg>
	);
}

function PauseIcon(): ReactNode {
	return (
		<svg width={ICON} height={ICON} viewBox="0 0 24 24" aria-hidden="true">
			<rect x="6" y="4.5" width="4" height="15" rx="1" fill="white" />
			<rect x="14" y="4.5" width="4" height="15" rx="1" fill="white" />
		</svg>
	);
}

function Spinner(): ReactNode {
	return (
		<svg width={ICON} height={ICON} viewBox="0 0 24 24" aria-hidden="true">
			<circle
				cx="12"
				cy="12"
				r="8"
				stroke="white"
				strokeOpacity="0.3"
				strokeWidth="3"
				fill="none"
			/>
			<path d="M12 4a8 8 0 0 1 8 8" stroke="white" strokeWidth="3" fill="none">
				<animateTransform
					attributeName="transform"
					type="rotate"
					from="0 12 12"
					to="360 12 12"
					dur="0.8s"
					repeatCount="indefinite"
				/>
			</path>
		</svg>
	);
}

function VolumeIcon({ muted }: { muted: boolean }): ReactNode {
	return (
		<svg width={ICON} height={ICON} viewBox="0 0 24 24" aria-hidden="true">
			<path d="M4 9.5h4l5-4v13l-5-4H4z" fill="white" />
			{muted ? (
				<path d="M16 9l5 6m0-6l-5 6" stroke="white" strokeWidth="2" />
			) : (
				<path d="M16 8.5a5 5 0 0 1 0 7" stroke="white" strokeWidth="2" fill="none" />
			)}
		</svg>
	);
}

function FullscreenIcon({ active }: { active: boolean }): ReactNode {
	const d = active
		? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"
		: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5";
	return (
		<svg width={ICON} height={ICON} viewBox="0 0 24 24" aria-hidden="true">
			<path d={d} stroke="white" strokeWidth="2" fill="none" />
		</svg>
	);
}

const BUTTON: CSSProperties = {
	background: "none",
	border: "none",
	padding: 4,
	margin: 0,
	cursor: "pointer",
	display: "inline-flex",
	alignItems: "center",
	color: "white",
};

/** Props of the default controls bar. */
export interface ControlsProps {
	store: PlaybackStore;
	fps: number;
	durationInFrames: number;
	inFrame: number | null;
	outFrame: number | null;
	playbackRate: number;
	visible: boolean;
	isBuffering: boolean;
	showVolumeControls: boolean;
	fullscreenAvailable: boolean;
	isFullscreen: boolean;
	onToggle: (e: PlayerGestureEvent) => void;
	onToggleFullscreen: () => void;
	playbackRates: number[] | null;
	onPlaybackRateChange: ((rate: number) => void) | null;
	renderPlayPauseButton: RenderPlayPauseButton | undefined;
	renderFullscreenButton: RenderFullscreenButton | undefined;
	renderMuteButton: RenderMuteButton | undefined;
	renderVolumeSlider: RenderVolumeSlider | undefined;
	renderCustomControls: RenderCustomControls | undefined;
}

/** The default controls: play/pause, volume, time, rate, custom slot, fullscreen, seek bar. */
export function Controls(props: ControlsProps): ReactNode {
	const { store, fps, durationInFrames, visible } = props;
	const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
	const muted = snap.muted || snap.volume === 0;
	const volume = snap.muted ? 0 : snap.volume;
	const volumeInput = useRef<HTMLInputElement | null>(null);

	const setVolume = useCallback(
		(v: number) => {
			if (v > 0 && store.getSnapshot().muted) store.unmute();
			store.setVolume(v);
		},
		[store],
	);

	const customPlayPause = props.renderPlayPauseButton?.({
		playing: snap.playing,
		isBuffering: props.isBuffering,
	});
	const playPauseContent =
		customPlayPause !== undefined && customPlayPause !== null ? (
			customPlayPause
		) : snap.playing && props.isBuffering ? (
			<Spinner />
		) : snap.playing ? (
			<PauseIcon />
		) : (
			<PlayIcon />
		);

	return (
		<div
			data-motio-controls=""
			style={{
				position: "absolute",
				left: 0,
				right: 0,
				bottom: 0,
				padding: "8px 12px",
				background: "linear-gradient(transparent, rgba(0, 0, 0, 0.55))",
				opacity: visible ? 1 : 0,
				pointerEvents: visible ? "auto" : "none",
				transition: "opacity 0.3s",
				fontFamily: "sans-serif",
				fontSize: 14,
				color: "white",
				boxSizing: "border-box",
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
				<button
					type="button"
					aria-label={snap.playing ? "Pause" : "Play"}
					style={BUTTON}
					onClick={(e) => props.onToggle(e)}
				>
					{playPauseContent}
				</button>
				{props.showVolumeControls ? (
					<>
						{props.renderMuteButton ? (
							props.renderMuteButton({ muted, volume })
						) : (
							<button
								type="button"
								aria-label={muted ? "Unmute" : "Mute"}
								style={BUTTON}
								onClick={() => {
									if (muted) {
										store.unmute();
										if (store.getSnapshot().volume === 0) store.setVolume(1);
									} else store.mute();
								}}
							>
								<VolumeIcon muted={muted} />
							</button>
						)}
						{props.renderVolumeSlider ? (
							props.renderVolumeSlider({
								isVertical: false,
								volume,
								onBlur: () => {},
								inputRef: volumeInput,
								setVolume,
							})
						) : (
							<input
								ref={volumeInput}
								type="range"
								aria-label="Volume"
								min={0}
								max={1}
								step={0.01}
								value={volume}
								style={{ width: 70 }}
								onChange={(e) => setVolume(Number(e.currentTarget.value))}
							/>
						)}
					</>
				) : null}
				<span style={{ fontVariantNumeric: "tabular-nums" }}>
					{`${formatTime(snap.frame, fps)} / ${formatTime(durationInFrames, fps)}`}
				</span>
				<div style={{ flex: 1 }} />
				{props.playbackRates && props.onPlaybackRateChange ? (
					<select
						aria-label="Playback rate"
						value={props.playbackRate}
						onChange={(e) => props.onPlaybackRateChange?.(Number(e.currentTarget.value))}
						style={{ background: "transparent", color: "white", border: "none" }}
					>
						{props.playbackRates.map((r) => (
							<option key={r} value={r} style={{ color: "black" }}>
								{`${r}x`}
							</option>
						))}
					</select>
				) : null}
				{props.renderCustomControls ? props.renderCustomControls() : null}
				{props.fullscreenAvailable ? (
					<button
						type="button"
						aria-label={props.isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
						style={BUTTON}
						onClick={props.onToggleFullscreen}
					>
						{props.renderFullscreenButton ? (
							props.renderFullscreenButton({ isFullscreen: props.isFullscreen })
						) : (
							<FullscreenIcon active={props.isFullscreen} />
						)}
					</button>
				) : null}
			</div>
			<SeekBar
				store={store}
				frame={snap.frame}
				durationInFrames={durationInFrames}
				inFrame={props.inFrame}
				outFrame={props.outFrame}
			/>
		</div>
	);
}

/** The seek bar: dragging pauses, seeks under the pointer, and resumes if it was playing. */
function SeekBar({
	store,
	frame,
	durationInFrames,
	inFrame,
	outFrame,
}: {
	store: PlaybackStore;
	frame: number;
	durationInFrames: number;
	inFrame: number | null;
	outFrame: number | null;
}): ReactNode {
	const bar = useRef<HTMLDivElement | null>(null);
	const [dragging, setDragging] = useState<{ wasPlaying: boolean } | null>(null);
	const last = Math.max(1, durationInFrames - 1);
	const range = playbackRange(durationInFrames, inFrame, outFrame);

	const frameAt = (clientX: number): number => {
		const rect = bar.current?.getBoundingClientRect();
		if (!rect || rect.width <= 0) return frame;
		const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
		return Math.round(ratio * last);
	};

	const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
		if (e.button !== 0) return;
		const wasPlaying = store.getSnapshot().playing;
		e.currentTarget.setPointerCapture?.(e.pointerId);
		store.setScrubbing(true);
		store.pause();
		store.seekTo(frameAt(e.clientX));
		setDragging({ wasPlaying });
	};

	const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
		if (dragging) store.seekTo(frameAt(e.clientX));
	};

	const end = (e: ReactPointerEvent<HTMLDivElement>) => {
		if (!dragging) return;
		e.currentTarget.releasePointerCapture?.(e.pointerId);
		store.setScrubbing(false);
		if (dragging.wasPlaying) store.play();
		setDragging(null);
	};

	useEffect(() => () => store.setScrubbing(false), [store]);

	const pct = (f: number) => `${(f / last) * 100}%`;
	return (
		<div
			ref={bar}
			role="slider"
			tabIndex={-1}
			aria-label="Seek"
			aria-valuemin={0}
			aria-valuemax={durationInFrames - 1}
			aria-valuenow={frame}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={end}
			onPointerCancel={end}
			style={{ position: "relative", height: 14, cursor: "pointer", touchAction: "none" }}
		>
			<div
				style={{
					position: "absolute",
					left: 0,
					right: 0,
					top: 5,
					height: 4,
					borderRadius: 2,
					background: "rgba(255, 255, 255, 0.3)",
				}}
			/>
			{inFrame !== null || outFrame !== null ? (
				<div
					style={{
						position: "absolute",
						left: pct(range.start),
						width: `calc(${pct(range.end)} - ${pct(range.start)})`,
						top: 5,
						height: 4,
						background: "rgba(255, 255, 255, 0.3)",
					}}
				/>
			) : null}
			<div
				style={{
					position: "absolute",
					left: 0,
					width: pct(frame),
					top: 5,
					height: 4,
					borderRadius: 2,
					background: "white",
				}}
			/>
		</div>
	);
}
