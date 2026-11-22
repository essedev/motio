import { createContext } from "react";
import type { VideoConfig } from "../timeline/contexts.js";
import type { RegisteredComposition } from "./types.js";

/** Collects the compositions registered by the root. Stable for the life of the page. */
export class CompositionRegistry {
	private readonly entries = new Map<string, { owner: object; entry: RegisteredComposition }>();
	private readonly listeners = new Set<() => void>();

	/** Registers or updates a composition. `owner` identifies the `<Composition>` instance. */
	register(owner: object, entry: RegisteredComposition): void {
		const existing = this.entries.get(entry.id);
		if (existing && existing.owner !== owner) {
			throw new Error(
				`Two compositions use the id "${entry.id}". Composition ids must be unique within the root.`,
			);
		}
		this.entries.set(entry.id, { owner, entry });
		for (const l of this.listeners) l();
	}

	unregister(owner: object, id: string): void {
		const existing = this.entries.get(id);
		if (existing && existing.owner === owner) {
			this.entries.delete(id);
			for (const l of this.listeners) l();
		}
	}

	get(id: string): RegisteredComposition | undefined {
		return this.entries.get(id)?.entry;
	}

	/** Compositions in registration order. */
	list(): RegisteredComposition[] {
		return [...this.entries.values()].map((e) => e.entry);
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
}

export const CompositionRegistryContext = createContext<CompositionRegistry | null>(null);

/** The composition selected for rendering and the frame to render. */
export interface CompositionSelection {
	id: string;
	config: VideoConfig;
	frame: number;
	/** Where the selected composition is portaled. */
	canvas: HTMLElement;
	/** Bumped to remount the composition after an error. */
	generation: number;
}

export const CompositionSelectionContext = createContext<CompositionSelection | null>(null);
