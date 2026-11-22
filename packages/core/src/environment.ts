import { createContext, useContext } from "react";
import { RUN_CONTEXT_GLOBAL, type RunContext } from "./protocol.js";

/** Where the code is running, as returned by `getRemotionEnvironment()`. */
export interface RemotionEnvironment {
	/** Inside the studio. Motio has no studio, so this is always false. */
	isStudio: boolean;
	/** During a render by the renderer. */
	isRendering: boolean;
	/** A Player is mounted on the page. */
	isPlayer: boolean;
	/** In a statically deployed studio. Always false in Motio. */
	isReadOnlyStudio: boolean;
	/** Always false from `getRemotionEnvironment()`; see `useRemotionEnvironment()`. */
	isClientSideRendering: boolean;
}

/** The run context injected by the renderer before any page script, or null outside a render. */
export function getRunContext(): RunContext | null {
	if (typeof globalThis === "undefined") return null;
	const value = (globalThis as Record<string, unknown>)[RUN_CONTEXT_GLOBAL];
	if (value === undefined || value === null || typeof value !== "object") return null;
	return value as RunContext;
}

let playersMounted = 0;

/**
 * Called by the Player when it mounts and unmounts, so `getRemotionEnvironment().isPlayer`
 * reflects whether a Player is on the page. Returns the function that unregisters it.
 */
export function registerPlayerMount(): () => void {
	playersMounted++;
	let done = false;
	return () => {
		if (done) return;
		done = true;
		playersMounted--;
	};
}

/**
 * Tells where the code runs: rendering, Player, studio. Prefer `useRemotionEnvironment()` in
 * components.
 */
export function getRemotionEnvironment(): RemotionEnvironment {
	const ctx = getRunContext();
	return {
		isStudio: false,
		isRendering: ctx?.isRendering === true,
		isPlayer: playersMounted > 0,
		isReadOnlyStudio: false,
		isClientSideRendering: false,
	};
}

/** Lets a renderer scope the environment to a subtree (client-side rendering, the Player). */
export const RemotionEnvironmentContext = createContext<RemotionEnvironment | null>(null);

/** The environment for the calling component; same fields as `getRemotionEnvironment()`. */
export function useRemotionEnvironment(): RemotionEnvironment {
	const scoped = useContext(RemotionEnvironmentContext);
	return scoped ?? getRemotionEnvironment();
}

/**
 * The props passed to the render (`--props` or `inputProps`). Returns `{}` when no run context
 * was injected, as in the Player.
 */
export function getInputProps<T extends Record<string, unknown> = Record<string, unknown>>(): T {
	return (getRunContext()?.inputProps ?? {}) as T;
}
