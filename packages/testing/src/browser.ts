/**
 * Extra Chrome arguments for tests that launch the pinned browser themselves. Inside the pinned
 * Linux image (`MOTIO_CHROME_NO_SANDBOX=1`) Chrome needs `--no-sandbox`: Docker's default seccomp
 * profile blocks the user namespaces its sandbox uses, and the container is the isolation
 * boundary (D-013). Elsewhere the sandbox stays on.
 */
export function testChromeArgs(extra: readonly string[] = []): string[] {
	const sandbox = process.env.MOTIO_CHROME_NO_SANDBOX === "1" ? ["--no-sandbox"] : [];
	return [...sandbox, ...extra];
}
