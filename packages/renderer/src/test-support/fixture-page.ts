import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const FIXTURE = resolve(import.meta.dirname, "../../../../fixtures/protocol-page");
const DIST = join(FIXTURE, "dist");

function newest(path: string): number {
	const s = statSync(path);
	if (!s.isDirectory()) return s.mtimeMs;
	let m = s.mtimeMs;
	for (const e of readdirSync(path)) {
		if (e === "node_modules" || e === "dist") continue;
		m = Math.max(m, newest(join(path, e)));
	}
	return m;
}

/** Builds the protocol fixture page if its sources are newer than its build; returns the bundle dir. */
export function fixturePageDir(): string {
	let built = 0;
	try {
		built = statSync(join(DIST, "index.html")).mtimeMs;
	} catch {
		built = 0;
	}
	const sources = Math.max(
		newest(FIXTURE),
		statSync(resolve(FIXTURE, "../../packages/testing/src/frame-stamp.ts")).mtimeMs,
		statSync(resolve(FIXTURE, "../../packages/core/src/protocol.ts")).mtimeMs,
	);
	if (sources > built) {
		const r = spawnSync("pnpm", ["--filter", "@motiojs/fixture-protocol-page", "build"], {
			encoding: "utf8",
		});
		if (r.status !== 0) throw new Error(`fixture build failed:\n${r.stdout}\n${r.stderr}`);
	}
	return DIST;
}

/** Deterministic Fisher-Yates shuffle. */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
	const a = [...items];
	let s = seed;
	for (let i = a.length - 1; i > 0; i--) {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		const j = s % (i + 1);
		[a[i], a[j]] = [a[j] as T, a[i] as T];
	}
	return a;
}

/** Process ids of the direct children of this process. */
export function childPids(): number[] {
	const r = spawnSync("pgrep", ["-P", String(process.pid)], { encoding: "utf8" });
	return r.stdout
		.split("\n")
		.map((l) => Number(l.trim()))
		.filter((n) => n > 0);
}

/** Process ids of every descendant of `pid`, children first. */
export function descendantPids(pid: number): number[] {
	const out: number[] = [];
	const queue = [pid];
	for (let p = queue.shift(); p !== undefined; p = queue.shift()) {
		const r = spawnSync("pgrep", ["-P", String(p)], { encoding: "utf8" });
		for (const child of r.stdout.split("\n").map((l) => Number(l.trim()))) {
			if (child > 0) {
				out.push(child);
				queue.push(child);
			}
		}
	}
	return out;
}

/** The command line of a process, or an empty string once it exited. */
export function commandLine(pid: number): string {
	// The command line, not `comm`: Linux truncates `comm` to 15 characters.
	return spawnSync("ps", ["-o", "args=", "-p", String(pid)], { encoding: "utf8" }).stdout;
}
