import { act, Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A mounted React tree in jsdom. */
export interface Mounted {
	host: HTMLDivElement;
	root: Root;
	rerender(node: ReactNode): void;
	unmount(): void;
}

/** Renders `node` into a fresh element of `document.body` inside `act`. */
export function mount(node: ReactNode): Mounted {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const root = createRoot(host);
	act(() => root.render(node));
	return {
		host,
		root,
		rerender: (next) => act(() => root.render(next)),
		unmount: () => {
			act(() => root.unmount());
			host.remove();
		},
	};
}

/** Advances fake timers (and animation frames) inside `act`. */
export function advance(ms: number): void {
	act(() => {
		vi.advanceTimersByTime(ms);
	});
}

/** Catches render errors so tests can assert on them. */
export class Catch extends Component<
	{ onError: (e: unknown) => void; children?: ReactNode },
	{ failed: boolean }
> {
	override state = { failed: false };
	static getDerivedStateFromError(): { failed: boolean } {
		return { failed: true };
	}
	override componentDidCatch(error: unknown, _info: ErrorInfo): void {
		this.props.onError(error);
	}
	override render(): ReactNode {
		return this.state.failed ? null : this.props.children;
	}
}

import { vi } from "vitest";

/** Fake timers covering the real clock the Player reads. */
export function useFakeClock(): void {
	vi.useFakeTimers({
		toFake: [
			"setTimeout",
			"clearTimeout",
			"setInterval",
			"clearInterval",
			"requestAnimationFrame",
			"cancelAnimationFrame",
			"performance",
			"Date",
		],
	});
}
