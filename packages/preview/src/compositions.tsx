import {
	CompositionRegistry,
	CompositionRegistryContext,
	CompositionSelectionContext,
	type RegisteredComposition,
} from "@motiojs/core/internals";
import {
	Component,
	type ComponentType,
	type ErrorInfo,
	memo,
	type ReactNode,
	useMemo,
	useSyncExternalStore,
} from "react";

interface BoundaryProps {
	onError: (error: Error) => void;
	children?: ReactNode;
}

class CollectBoundary extends Component<BoundaryProps, { failed: boolean }> {
	override state = { failed: false };
	static getDerivedStateFromError(): { failed: boolean } {
		return { failed: true };
	}
	override componentDidCatch(error: unknown, _info: ErrorInfo): void {
		this.props.onError(error instanceof Error ? error : new Error(String(error)));
	}
	override render(): ReactNode {
		return this.state.failed ? null : this.props.children;
	}
}

interface CollectorProps {
	root: ComponentType;
	registry: CompositionRegistry;
	onError: (error: Error) => void;
}

/**
 * Renders the user's root with no composition selected, so every `<Composition>` and `<Still>`
 * registers itself and renders nothing. Memoised: the root re-renders only when it changes or
 * when Fast Refresh updates it, never because the page re-rendered, which would loop through
 * the registry's change notifications.
 */
export const RootCollector = memo(function RootCollector({
	root: Root,
	registry,
	onError,
}: CollectorProps) {
	return (
		<CollectBoundary onError={onError}>
			<CompositionRegistryContext.Provider value={registry}>
				<CompositionSelectionContext.Provider value={null}>
					<Root />
				</CompositionSelectionContext.Provider>
			</CompositionRegistryContext.Provider>
		</CollectBoundary>
	);
});

/** A registry that tells subscribers when a composition registers, updates or leaves. */
export function useCompositionRegistry(): CompositionRegistry {
	return useMemo(() => new CompositionRegistry(), []);
}

/**
 * A stable snapshot of the registry for `useSyncExternalStore`: the same array until an entry
 * changes. Compared by content rather than counted through notifications, because the root's
 * compositions register in layout effects that run before the page has subscribed.
 */
class RegistrySnapshot {
	private cached: RegisteredComposition[] = [];
	constructor(private readonly registry: CompositionRegistry) {}
	subscribe = (listener: () => void) => this.registry.subscribe(listener);
	get = (): RegisteredComposition[] => {
		const list = this.registry.list();
		const same =
			list.length === this.cached.length && list.every((entry, i) => entry === this.cached[i]);
		if (!same) this.cached = list;
		return this.cached;
	};
}

/** The registered compositions, in registration order; re-renders when they change. */
export function useCompositions(registry: CompositionRegistry): RegisteredComposition[] {
	const snapshot = useMemo(() => new RegistrySnapshot(registry), [registry]);
	return useSyncExternalStore(snapshot.subscribe, snapshot.get, snapshot.get);
}

/**
 * A key that changes only when something that affects the resolved metadata or the rendering
 * changed. Entries are rebuilt on every render of the root, so identity alone is useless.
 */
export function entrySignature(entry: RegisteredComposition): string {
	const fields = [
		entry.id,
		entry.width ?? null,
		entry.height ?? null,
		entry.fps ?? null,
		entry.durationInFrames ?? null,
		entry.isStill,
	];
	try {
		return JSON.stringify([...fields, entry.defaultProps]);
	} catch {
		// defaultProps that JSON cannot encode (a cycle) only lose change detection.
		return JSON.stringify(fields);
	}
}

/** Groups compositions by folder path, keeping registration order inside each group. */
export function groupByFolder(
	entries: readonly RegisteredComposition[],
): Array<{ folder: string | null; entries: RegisteredComposition[] }> {
	const groups = new Map<string | null, RegisteredComposition[]>();
	for (const entry of entries) {
		const group = groups.get(entry.folder);
		if (group) group.push(entry);
		else groups.set(entry.folder, [entry]);
	}
	return [...groups].map(([folder, list]) => ({ folder, entries: list }));
}
