import { spawn, spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fixturePageDir } from "./test-support/fixture-page.js";

const serveUrl = fixturePageDir();
const rendererEntry = resolve(import.meta.dirname, "../dist/index.js");
const child = join(import.meta.dirname, "test-support", "render-then-exit.mjs");

/** Browser processes that are direct children of `pid`. */
function browserChildren(pid: number): number[] {
	const r = spawnSync("pgrep", ["-P", String(pid)], { encoding: "utf8" });
	return r.stdout
		.split("\n")
		.map((l) => Number(l.trim()))
		.filter((n) => n > 0)
		.filter((n) => {
			const ps = spawnSync("ps", ["-o", "command=", "-p", String(n)], { encoding: "utf8" });
			return ps.stdout.includes("chrome-headless-shell");
		});
}

function alive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/**
 * Runs a render in a child process, ends that process the given way while frames flow, and
 * returns its exit code or signal and the browsers it had launched.
 */
async function renderAndEnd(
	how: "SIGTERM" | "SIGINT" | "exit",
): Promise<{ code: number | null; signal: NodeJS.Signals | null; browsers: number[] }> {
	const proc = spawn(process.execPath, [child, rendererEntry, serveUrl, how], {
		stdio: ["ignore", "pipe", "pipe"],
	});
	let browsers: number[] = [];
	let stderr = "";
	proc.stderr.on("data", (d) => {
		stderr += String(d);
	});
	proc.stdout.on("data", (d) => {
		if (String(d).includes("rendering") && browsers.length === 0) {
			browsers = browserChildren(proc.pid as number);
		}
	});
	const [code, signal] = await new Promise<[number | null, NodeJS.Signals | null]>((ok) =>
		proc.on("exit", (c, s) => ok([c, s])),
	);
	if (browsers.length === 0) throw new Error(`the child never rendered:\n${stderr}`);
	return { code, signal, browsers };
}

describe("browsers of a process that ends during a render", () => {
	// Before the fix, every run of these left two chrome-headless-shell processes behind: they
	// are launched detached, and nothing killed them when the process ended this way.
	for (const how of ["SIGTERM", "SIGINT", "exit"] as const) {
		it(`are killed when it ends with ${how === "exit" ? "process.exit()" : how}`, async () => {
			const { code, signal, browsers } = await renderAndEnd(how);
			expect(browsers.length).toBeGreaterThanOrEqual(1);
			// The signal keeps its default outcome: the process ends with it.
			if (how === "exit") expect(code).toBe(3);
			else expect(signal ?? code).toBe(signal === null ? (how === "SIGTERM" ? 143 : 130) : how);
			await new Promise((r) => setTimeout(r, 500));
			expect(browsers.filter(alive)).toEqual([]);
		}, 60_000);
	}
});
