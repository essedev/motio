/** Levenshtein distance between two strings. */
export function editDistance(a: string, b: string): number {
	let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const current = [i];
		for (let j = 1; j <= b.length; j++) {
			current[j] = Math.min(
				(previous[j] as number) + 1,
				(current[j - 1] as number) + 1,
				(previous[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
		}
		previous = current;
	}
	return previous[b.length] as number;
}

/**
 * The candidate closest to `input`, or null when none is close enough to be a likely typo:
 * at most a third of the input's length in edits (at least one), or a candidate that starts
 * with the input or the input with it (`--prop` for `--props`).
 */
export function closest(input: string, candidates: readonly string[]): string | null {
	let best: { candidate: string; distance: number } | null = null;
	for (const candidate of candidates) {
		const distance =
			input.length >= 3 && (candidate.startsWith(input) || input.startsWith(candidate))
				? Math.min(1, editDistance(input, candidate))
				: editDistance(input, candidate);
		if (!best || distance < best.distance) best = { candidate, distance };
	}
	if (!best || best.distance === 0) return best?.candidate ?? null;
	return best.distance <= Math.max(1, Math.floor(input.length / 3)) ? best.candidate : null;
}
