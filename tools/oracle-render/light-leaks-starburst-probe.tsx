// Page side of record-light-leaks-starburst.ts: calls the published @remotion/starburst and
// @remotion/light-leaks in the pinned Chrome and returns plain data. Bundled with esbuild; public
// API only.
import { LightLeak, lightLeak, lightLeakEffectSchema } from "@remotion/light-leaks";
import { Thumbnail } from "@remotion/player";
import { Starburst, starburst, starburstEffectSchema } from "@remotion/starburst";
import { createElement as h } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

type Props = Record<string, unknown>;
type Group = {
	markup: Array<{ props: Props; frame: number }>;
	invalid: Props[];
	factory: Array<Props | null>;
};

export interface ProbeSpec {
	starburst: Group;
	lightLeak: Group;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Restores the numbers and `undefined` tagged by the recorder. */
const untag = (props: Props): Props =>
	Object.fromEntries(
		Object.entries(props).map(([k, v]) => {
			if (v !== null && typeof v === "object" && "$n" in v)
				return [k, Number((v as { $n: string }).$n)];
			if (v !== null && typeof v === "object" && "$u" in v) return [k, undefined];
			return [k, v];
		}),
	);

const errorTypeOf = (error: unknown) => {
	for (const ctor of [TypeError, RangeError, SyntaxError, ReferenceError])
		if (error instanceof ctor) return ctor.name;
	return error instanceof Error ? "Error" : typeof error;
};

const thumbnail = (component: unknown, props: Props, frame: number, onError?: (e: Error) => void) =>
	h(Thumbnail, {
		component: () => h(component as never, props as never),
		durationInFrames: 60,
		compositionWidth: 320,
		compositionHeight: 180,
		fps: 30,
		frameToDisplay: frame,
		...(onError
			? {
					errorFallback: ({ error }: { error: Error }) => {
						onError(error);
						return null;
					},
				}
			: {}),
	});

/** The markup inside the Thumbnail's own wrappers. */
const inner = (markup: string) =>
	markup.replace(/^.*?class="__remotion-player">/, "").replace(/<\/div><\/div><\/div>$/, "");

/** Mounts the component in a Thumbnail and returns the error it fails with, if any. */
async function failureOf(component: unknown, props: Props) {
	let failure: unknown = null;
	const host = document.createElement("div");
	document.body.appendChild(host);
	const root = createRoot(host);
	flushSync(() => root.render(thumbnail(component, props, 0, (e) => (failure = e))));
	await sleep(100);
	root.unmount();
	host.remove();
	if (failure === null) return { error: null };
	return {
		error: failure instanceof Error ? failure.message : String(failure),
		errorType: errorTypeOf(failure),
	};
}

/** What an effect factory returns, functions replaced by their arity. */
const describe = (value: unknown, depth = 0): unknown => {
	if (depth > 6) return "...";
	if (typeof value === "function") return `function/${value.length}`;
	if (Array.isArray(value)) return value.map((v) => describe(v, depth + 1));
	if (value && typeof value === "object") {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, describe(v, depth + 1)]));
	}
	return value;
};

function factoryCall(fn: (params?: unknown) => unknown, params: Props | null) {
	try {
		return { params, effect: describe(params === null ? fn() : fn(untag(params))) };
	} catch (error) {
		return {
			params,
			error: error instanceof Error ? error.message : String(error),
			errorType: errorTypeOf(error),
		};
	}
}

async function group(
	component: unknown,
	factory: (params?: unknown) => unknown,
	schema: unknown,
	spec: Group,
) {
	const markup = spec.markup.map(({ props, frame }) => ({
		props,
		frame,
		markup: inner(renderToStaticMarkup(thumbnail(component, untag(props), frame))),
	}));
	const invalid = [];
	for (const props of spec.invalid)
		invalid.push({ props, ...(await failureOf(component, untag(props))) });
	return { markup, invalid, factory: spec.factory.map((p) => factoryCall(factory, p)), schema };
}

export async function runProbe(spec: ProbeSpec) {
	return {
		starburst: await group(Starburst, starburst as never, starburstEffectSchema, spec.starburst),
		lightLeak: await group(LightLeak, lightLeak as never, lightLeakEffectSchema, spec.lightLeak),
	};
}
