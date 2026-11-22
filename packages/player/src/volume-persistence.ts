/** The `localStorage` key the volume is kept under unless `volumePersistenceKey` is set. */
export const DEFAULT_VOLUME_KEY = "remotion.volumePreference";

function storage(): Storage | null {
	// Reading `localStorage` throws in sandboxed iframes and with storage disabled; persistence
	// is a convenience, so the Player then starts at full volume and does not persist.
	try {
		return typeof localStorage === "undefined" ? null : localStorage;
	} catch {
		return null;
	}
}

/** The persisted volume, or null when none is stored or it is invalid. */
export function readPersistedVolume(key: string): number | null {
	const raw = storage()?.getItem(key);
	if (raw === null || raw === undefined) return null;
	const value = Number(raw);
	return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

/** Stores the volume; does nothing where storage is unavailable or full. */
export function persistVolume(key: string, volume: number): void {
	const s = storage();
	if (!s) return;
	try {
		s.setItem(key, String(volume));
	} catch (error) {
		// Quota exceeded or storage blocked: the volume still applies, it is just not remembered.
		console.warn(`Could not persist the Player volume under "${key}":`, error);
	}
}
