import { useEffect, useState } from "react";
import { displayUrl, type Problem } from "./problems.js";
import { mapStack } from "./stack.js";

function seconds(ms: number): string {
	return `${Math.floor(ms / 1000)} s`;
}

/** Where `delayRender()` was called, as `src/Data.tsx:12`, mapped through the source maps. */
function useCallSite(stack: string | undefined): string | null {
	const [site, setSite] = useState<string | null>(null);
	useEffect(() => {
		let cancelled = false;
		if (!stack) return;
		mapStack(stack)
			.then((frames) => {
				const own = frames.find((f) => !f.internal);
				if (!cancelled && own) setSite(`${own.file}:${own.line}`);
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, [stack]);
	return site;
}

function DelayProblem({ problem }: { problem: Problem & { kind: "delay" } }) {
	const site = useCallSite(problem.stack);
	const expired = problem.elapsedMs >= problem.timeoutMs;
	return (
		<li className="mp-problem" data-kind="delay">
			<p className="mp-problem-title">
				<code>delayRender({problem.label === null ? "" : JSON.stringify(problem.label)})</code> open
				for {seconds(problem.elapsedMs)}
			</p>
			<p className="mp-problem-detail">
				{expired
					? `A render would have failed after ${seconds(problem.timeoutMs)}`
					: `A render waits up to ${seconds(problem.timeoutMs)}`}{" "}
				for <code>continueRender()</code> with this handle.
				{site ? (
					<>
						{" "}
						Called at <code>{site}</code>.
					</>
				) : null}
			</p>
		</li>
	);
}

function ProblemItem({ problem }: { problem: Problem }) {
	switch (problem.kind) {
		case "load":
			return (
				<li className="mp-problem" data-kind="load">
					<p className="mp-problem-title">
						{problem.what} not loaded{problem.status ? ` (HTTP ${problem.status})` : ""}
					</p>
					<p className="mp-problem-detail">
						<code>{displayUrl(problem.url)}</code>
						{problem.status === 404
							? ". Check the name and that the file is in public/ (staticFile() paths are case-sensitive on Linux)."
							: ". A render waits for it and fails."}
					</p>
				</li>
			);
		case "delay":
			return <DelayProblem problem={problem} />;
		case "cancelled":
			return (
				<li className="mp-problem" data-kind="cancelled">
					<p className="mp-problem-title">
						{problem.code ? <code>{problem.code}</code> : "cancelRender()"}: the render would fail
					</p>
					<p className="mp-problem-detail">{problem.message}</p>
				</li>
			);
		case "warning":
			return (
				<li className="mp-problem" data-kind="warning">
					<p className="mp-problem-title">
						<code>{problem.code}</code>
					</p>
					<p className="mp-problem-detail">{problem.message}</p>
				</li>
			);
	}
}

/**
 * What would make a render of this composition hang or fail, though the Player plays on: files
 * that did not load, `delayRender()` handles still open, a `cancelRender()`, and warnings.
 */
export function ProblemsPanel({ problems }: { problems: Problem[] }) {
	return (
		<section
			className="mp-section"
			id="mp-problems"
			aria-labelledby="mp-problems-title"
			data-testid="problems"
		>
			<h2 className="mp-section-title" id="mp-problems-title">
				Problems
				{problems.length > 0 ? (
					<span className="mp-count mp-count-warn">{problems.length}</span>
				) : null}
			</h2>
			{problems.length === 0 ? (
				<p className="mp-note">
					None so far. Failed loads, open <code>delayRender()</code> calls and warnings show up here
					as the composition plays.
				</p>
			) : (
				<ul className="mp-problems">
					{problems.map((problem) => (
						<ProblemItem key={problem.key} problem={problem} />
					))}
				</ul>
			)}
		</section>
	);
}
