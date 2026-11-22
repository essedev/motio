import { createHash } from "node:crypto";

/** SHA-256 (hex) of a decoded frame's pixels. Determinism is asserted on these, never on files. */
export function hashFrame(data: Uint8Array): string {
	return createHash("sha256").update(data).digest("hex");
}
