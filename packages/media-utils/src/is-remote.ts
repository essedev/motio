/**
 * Whether a source counts as remote, as Remotion reports it: anything that does not start with the
 * page's origin, except data URLs. Relative paths and blob URLs therefore count as remote.
 */
export function isRemoteAsset(src: string): boolean {
	const origin = globalThis.location?.origin;
	if (src.startsWith("data:")) return false;
	return origin === undefined || !src.startsWith(origin);
}
