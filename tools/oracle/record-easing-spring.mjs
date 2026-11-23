// Records Easing.spring(config) over t for a grid of configs. Called by
// record.mjs; public API only.
//
// A config whose spring never settles (stiffness <= 0, a threshold of 0)
// leaves Remotion in a state where later Easing.spring calls in the same
// process fail with "RangeError: Too many properties to enumerate", so those
// configs are recorded one per child process. In a fresh process the first
// evaluation of such a spring allocates until it runs out of memory or time;
// a child that does not finish within ISOLATED_TIMEOUT_MS is recorded as
// { error: "did not return", errorType: "timeout" }.

import { execFileSync } from "node:child_process";
import { Easing } from "remotion";
import { captureTyped, tag } from "./record-interpolate-outputs.mjs";

const T = (linspace) =>
	[
		...new Set([
			...linspace(-0.25, 2, 90),
			0,
			1,
			1e-9,
			-1e-9,
			1 - 1e-9,
			1 + 1e-9,
			0.5,
			3,
			10,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
		]),
	].sort((a, b) => a - b);

const CONFIGS = (() => {
	const configs = [undefined, {}, { damping: 200 }, { mass: 0.5 }, { damping: 100, mass: 0.5 }];
	for (const damping of [2, 5, 10, 15, 20, 26, 50, 1000]) configs.push({ damping });
	for (const mass of [0.1, 0.3, 2, 5]) configs.push({ mass });
	for (const stiffness of [10, 50, 300, 1000]) configs.push({ stiffness });
	for (const durationRestThreshold of [0.0001, 0.001, 0.01, 0.03, 0.1, 0.5, 1, 2]) {
		configs.push({ durationRestThreshold });
		configs.push({ durationRestThreshold, damping: 200 });
	}
	configs.push({ overshootClamping: true });
	configs.push({ overshootClamping: true, damping: 5, stiffness: 300 });
	configs.push({ mass: 3, damping: 4, stiffness: 50 });
	configs.push({ mass: 0.2, damping: 30, stiffness: 400, overshootClamping: true });
	configs.push({ foo: 1 });
	configs.push({ mass: 0 }, { mass: -1 });
	for (const base of [
		{},
		{ damping: 200 },
		{ damping: 200, durationRestThreshold: 0.03 },
		{ mass: 0.5 },
	]) {
		configs.push({ ...base, allowTail: true });
		configs.push({ ...base, allowTail: false });
	}
	configs.push({ allowTail: true, overshootClamping: true });
	configs.push({ allowTail: true, overshootClamping: true, damping: 5 });
	configs.push({ allowTail: true, durationRestThreshold: 0.1, stiffness: 50 });
	configs.push({ allowTail: true, mass: 0 });
	configs.push({ allowTail: "yes" }, { allowTail: 1 }, { allowTail: 0 });
	configs.push({ damping: 0 }, { damping: -1 });
	configs.push({ durationRestThreshold: -1 }, { durationRestThreshold: Number.NaN });
	return configs;
})();

// Each runs in a fresh process (see above).
const ISOLATED = [
	{ stiffness: 0 },
	{ stiffness: -1 },
	{ durationRestThreshold: 0 },
	{ damping: Number.NaN },
];

const ISOLATED_TIMEOUT_MS = 20_000;

const recordOne = (config, ts) => {
	const created = captureTyped(() => Easing.spring(config));
	if ("error" in created) return { config, error: created.error, errorType: created.errorType };
	const fn = created.out;
	return {
		config,
		extendRight: fn.remotionShouldExtendRight,
		t: ts,
		results: ts.map((t) => captureTyped(() => fn(t))),
	};
};

const recordIsolated = (config, ts, here) => {
	const code = `
		import { Easing } from "remotion";
		import { captureTyped, tag } from "./record-interpolate-outputs.mjs";
		const config = ${JSON.stringify(tag(config))};
		const untag = (v) => v && typeof v === "object" && "$n" in v ? Number(v.$n) : v;
		const real = Object.fromEntries(Object.entries(config).map(([k, v]) => [k, untag(v)]));
		const ts = ${JSON.stringify(tag(ts))}.map(untag);
		const created = captureTyped(() => Easing.spring(real));
		const out = "error" in created
			? { error: created.error, errorType: created.errorType }
			: { extendRight: created.out.remotionShouldExtendRight, results: ts.map((t) => captureTyped(() => created.out(t))) };
		process.stdout.write(JSON.stringify(tag(out)));
	`;
	let stdout;
	try {
		stdout = execFileSync(process.execPath, ["--input-type=module", "-e", code], {
			cwd: here,
			encoding: "utf8",
			timeout: ISOLATED_TIMEOUT_MS,
			stdio: ["ignore", "pipe", "ignore"],
		});
	} catch {
		return { config, error: "did not return", errorType: "timeout" };
	}
	const parsed = JSON.parse(stdout);
	return parsed.error === undefined ? { config, t: ts, ...parsed } : { config, ...parsed };
};

export const recordEasingSpring = ({ write, linspace, here }) => {
	const ts = T(linspace);
	const cases = CONFIGS.map((config) => tag(recordOne(config, ts)));
	for (const config of ISOLATED) {
		const result = recordIsolated(config, ts, here);
		cases.push({ ...result, config: tag(config), t: result.t ? tag(result.t) : undefined });
	}
	write(
		"easing-spring",
		"Easing.spring(config) over t; config undefined is written as { $u: true }; values tagged as in record-interpolate-outputs.mjs",
		cases,
	);
};
