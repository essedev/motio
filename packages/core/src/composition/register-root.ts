import type { ComponentType } from "react";

interface RootStore {
	root: ComponentType | null;
	waiters: Array<(root: ComponentType) => void>;
}

const ROOT_KEY = Symbol.for("motio.root");

function store(): RootStore {
	const g = globalThis as Record<symbol, unknown>;
	let s = g[ROOT_KEY] as RootStore | undefined;
	if (!s) {
		s = { root: null, waiters: [] };
		g[ROOT_KEY] = s;
	}
	return s;
}

/**
 * Registers the root component of the project, which renders the `<Composition>` and `<Still>`
 * elements. Call it once, from the entry file; it may be called after asynchronous work.
 */
export function registerRoot(root: ComponentType): void {
	if (typeof root !== "function" && (typeof root !== "object" || root === null)) {
		throw new TypeError(`registerRoot() expects a React component, got ${String(root)}.`);
	}
	const s = store();
	if (s.root) {
		throw new Error(
			"registerRoot() was called more than once. Call it once, from a file that is not re-executed by hot reloading.",
		);
	}
	s.root = root;
	const waiters = s.waiters;
	s.waiters = [];
	for (const w of waiters) w(root);
}

/** The registered root, or null before `registerRoot()`. */
export function getRoot(): ComponentType | null {
	return store().root;
}

/** Resolves with the root as soon as `registerRoot()` is called. */
export function waitForRoot(): Promise<ComponentType> {
	const s = store();
	if (s.root) return Promise.resolve(s.root);
	return new Promise((resolve) => s.waiters.push(resolve));
}

/** Forgets the registered root. For tests. */
export function resetRoot(): void {
	const s = store();
	s.root = null;
	s.waiters = [];
}
