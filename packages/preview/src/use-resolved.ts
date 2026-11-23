import { type RegisteredComposition, resolveComposition } from "@motiojs/core/internals";
import { useEffect, useState } from "react";

/** The resolved metadata shown in the Player; `VideoConfig` from core. */
export type ResolvedConfig = Awaited<ReturnType<typeof resolveComposition>>;

/** Where the metadata of the selected composition stands. */
export interface ResolvedState {
	/** The last config that resolved, kept while a new resolution runs. */
	config: ResolvedConfig | null;
	/** The id the config belongs to. */
	configId: string | null;
	pending: boolean;
	error: Error | null;
}

const IDLE: ResolvedState = { config: null, configId: null, pending: false, error: null };

/**
 * Runs `calculateMetadata()` for the selected composition with the edited props (the Player
 * does not run it), as the renderer does before a render. A newer request aborts the previous
 * one through its `abortSignal`. The last good config stays while the next one resolves, so
 * the Player is not unmounted on every keystroke.
 */
export function useResolvedComposition(
	entry: RegisteredComposition | null,
	signature: string,
	inputProps: Record<string, unknown> | null,
): ResolvedState {
	const [state, setState] = useState<ResolvedState>(IDLE);
	const calculateMetadata = entry?.calculateMetadata ?? null;
	// biome-ignore lint/correctness/useExhaustiveDependencies: `signature` and `calculateMetadata` stand for `entry`, which is a new object on every render of the root
	useEffect(() => {
		if (!entry || !inputProps) return;
		const controller = new AbortController();
		setState((previous) => ({
			...previous,
			...(previous.configId === entry.id ? {} : { config: null, configId: null }),
			pending: true,
			error: null,
		}));
		resolveComposition(entry, inputProps, {
			signal: controller.signal,
			isRendering: false,
			// Schema issues are shown next to the props editor instead.
			warn: () => {},
		}).then(
			(config) => {
				if (!controller.signal.aborted) {
					setState({ config, configId: entry.id, pending: false, error: null });
				}
			},
			(error: unknown) => {
				if (controller.signal.aborted) return;
				setState((previous) => ({
					...previous,
					pending: false,
					error: error instanceof Error ? error : new Error(String(error)),
				}));
			},
		);
		return () => controller.abort();
	}, [signature, calculateMetadata, inputProps]);
	return entry ? state : IDLE;
}
