/** Error codes raised by chunk planning and assembly. */
export type DistributedErrorCode = "E_CHUNK_PLAN" | "E_CHUNK_ASSEMBLE" | "E_CHUNK_RENDER";

/** A distributed rendering failure with a stable code and context. */
export class DistributedError extends Error {
	readonly code: DistributedErrorCode;
	readonly context: Record<string, unknown>;

	constructor(code: DistributedErrorCode, message: string, context: Record<string, unknown> = {}) {
		super(message);
		this.name = "DistributedError";
		this.code = code;
		this.context = context;
	}
}
