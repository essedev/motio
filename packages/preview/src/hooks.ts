import { useCallback, useRef, useState, useSyncExternalStore } from "react";

/** A callback ref and the element's client size, kept current with a ResizeObserver. */
export function useElementSize(): [
	(element: HTMLElement | null) => void,
	{ w: number; h: number },
] {
	const [size, setSize] = useState({ w: 0, h: 0 });
	const observer = useRef<ResizeObserver | null>(null);
	const ref = useCallback((element: HTMLElement | null) => {
		observer.current?.disconnect();
		observer.current = null;
		if (!element) return;
		const measure = () =>
			setSize((previous) =>
				previous.w === element.clientWidth && previous.h === element.clientHeight
					? previous
					: { w: element.clientWidth, h: element.clientHeight },
			);
		measure();
		if (typeof ResizeObserver !== "undefined") {
			observer.current = new ResizeObserver(measure);
			observer.current.observe(element);
		}
	}, []);
	return [ref, size];
}

/** Whether a media query matches, following changes. False where `matchMedia` is missing. */
export function useMediaQuery(query: string): boolean {
	const subscribe = useCallback(
		(listener: () => void) => {
			if (typeof matchMedia === "undefined") return () => {};
			const list = matchMedia(query);
			list.addEventListener("change", listener);
			return () => list.removeEventListener("change", listener);
		},
		[query],
	);
	const get = () => (typeof matchMedia === "undefined" ? false : matchMedia(query).matches);
	return useSyncExternalStore(subscribe, get, () => false);
}
