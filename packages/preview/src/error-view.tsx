import { useEffect, useState } from "react";
import { mapStack, type SourceContext, type StackFrame, stackHeadline } from "./stack.js";

function location(frame: StackFrame): string {
	return `${frame.file}:${frame.line}:${frame.column}`;
}

/** Source lines with numbers, the failing line marked and a caret under the column. */
export function CodeFrame({ context }: { context: SourceContext }) {
	const width = String(context.start + context.lines.length - 1).length;
	return (
		<pre className="mp-code" data-testid="code-frame">
			{context.lines.map((text, i) => {
				const number = context.start + i;
				const current = number === context.line;
				return (
					<span key={number} className="mp-code-line" data-current={current || undefined}>
						<span className="mp-code-number">{String(number).padStart(width, " ")}</span>
						{text.replace(/\t/g, "  ")}
						{"\n"}
						{current ? (
							<span className="mp-code-caret" aria-hidden="true">
								<span className="mp-code-number">{" ".repeat(width)}</span>
								{`${" ".repeat(caretOffset(text, context.column))}^\n`}
							</span>
						) : null}
					</span>
				);
			})}
		</pre>
	);
}

/** Visual column of a 1-based source column, with tabs shown as two spaces. */
function caretOffset(text: string, column: number): number {
	const before = text.slice(0, Math.max(0, column - 1));
	return before.replace(/\t/g, "  ").length;
}

function FrameList({ frames }: { frames: StackFrame[] }) {
	return (
		<ol className="mp-frames">
			{frames.map((frame, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: frames have no identity; the list is static
				<li key={i}>
					{frame.fn ? <span className="mp-frame-fn">{frame.fn}</span> : null}
					<span className="mp-frame-file">{location(frame)}</span>
				</li>
			))}
		</ol>
	);
}

/**
 * An error thrown by the user's code, with its stack mapped to the files they edit: where it
 * was thrown with the source around it, the calls in the project, and the frames of React,
 * Motio and other dependencies folded away.
 */
export function ErrorView({ error, where }: { error: Error; where?: string | undefined }) {
	const [frames, setFrames] = useState<StackFrame[] | null>(null);
	const stack = error.stack ?? "";
	useEffect(() => {
		let cancelled = false;
		setFrames(null);
		if (!stack) return;
		mapStack(stack)
			.then((mapped) => {
				if (!cancelled) setFrames(mapped);
			})
			.catch(() => {
				if (!cancelled) setFrames([]);
			});
		return () => {
			cancelled = true;
		};
	}, [stack]);
	const code = (error as { code?: unknown }).code;
	const own = frames?.filter((f) => !f.internal) ?? [];
	const internal = frames?.filter((f) => f.internal) ?? [];
	const top = own[0];
	return (
		<div className="mp-error-view" data-testid="error-view">
			<p className="mp-error-title">
				{typeof code === "string" ? <span className="mp-error-code">{code}</span> : null}
				{stackHeadline(error)}
			</p>
			{where ? <p className="mp-error-where">{where}</p> : null}
			{frames === null && stack ? <p className="mp-note">Reading the source maps…</p> : null}
			{top ? (
				<>
					<p className="mp-error-at" data-testid="error-location">
						{top.fn ? (
							<>
								In <code>{top.fn}</code>,{" "}
							</>
						) : null}
						<code>{location(top)}</code>
					</p>
					{top.context ? <CodeFrame context={top.context} /> : null}
					{own.length > 1 ? (
						<details className="mp-disclosure">
							<summary>Calls in your project ({own.length})</summary>
							<FrameList frames={own} />
						</details>
					) : null}
				</>
			) : null}
			{internal.length > 0 ? (
				<details className="mp-disclosure">
					<summary>
						{internal.length} {internal.length === 1 ? "frame" : "frames"} in React, Motio and other
						dependencies
					</summary>
					<FrameList frames={internal} />
				</details>
			) : null}
			{frames !== null && frames.length === 0 && stack ? (
				<pre className="mp-error-raw">{stack}</pre>
			) : null}
		</div>
	);
}
