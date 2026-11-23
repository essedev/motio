/** Body of the render-still request the page sends to the dev server. */
export interface StillRequestBody {
	compositionId: string;
	frame: number;
	inputProps: Record<string, unknown>;
}

/** A still rendered by the real pipeline. */
export interface RenderedStill {
	/** URL of the image on the dev server. */
	url: string;
	/** Absolute path of the image on disk. */
	file: string;
	frame: number;
	width: number;
	height: number;
	durationMs: number;
}

/** Error raised when the dev server could not render the still. */
export class StillError extends Error {
	constructor(
		readonly code: string,
		message: string,
	) {
		super(message);
		this.name = "StillError";
	}
}

/** Asks the dev server to render one frame through the renderer, as `motio still` does. */
export async function requestStill(
	endpoint: string,
	body: StillRequestBody,
	signal?: AbortSignal,
): Promise<RenderedStill> {
	let response: Response;
	try {
		response = await fetch(endpoint, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
			...(signal ? { signal } : {}),
		});
	} catch (error) {
		if (signal?.aborted) throw error;
		throw new StillError(
			"E_DEV_SERVER_UNREACHABLE",
			`The dev server did not answer: ${error instanceof Error ? error.message : String(error)}. Is motio dev still running?`,
		);
	}
	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		throw new StillError("E_INTERNAL", `The dev server answered ${response.status} without JSON.`);
	}
	const result = payload as
		| ({ ok: true } & RenderedStill)
		| { ok: false; error: { code: string; message: string } };
	if (!result.ok) throw new StillError(result.error.code, result.error.message);
	return {
		url: result.url,
		file: result.file,
		frame: result.frame,
		width: result.width,
		height: result.height,
		durationMs: result.durationMs,
	};
}
